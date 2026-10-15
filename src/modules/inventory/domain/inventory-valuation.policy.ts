import {Prisma} from '../../../generated/prisma/client.js';

// Accounting balances retain the six-decimal values of posted movements.
// The six-decimal unit average is only a display/operational approximation.
export const bookKey=(articuloId:string,ubicacionId:string)=>articuloId+':'+ubicacionId;

export function weightedAverageFromBook(
 currentQuantity:Prisma.Decimal,currentBookValue:Prisma.Decimal,
 incomingQuantity:Prisma.Decimal,incomingUnitCost:Prisma.Decimal,
 incomingValue=incomingQuantity.mul(incomingUnitCost)){
 const total=currentQuantity.plus(incomingQuantity);
 if(total.isZero())return new Prisma.Decimal(0);
 return currentBookValue.plus(incomingValue)
  .div(total).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
}

export type BookPosition={
 id:string;articuloId:string;ubicacionId:string;cantidad:Prisma.Decimal;
};

// All positions sharing an article/location use the same average; distribute
// the posted book balance proportionally and assign any rounding remainder to
// the final position, so paged UI rows reconcile to the report exactly.
export function allocatePoolBookValues(
 positions:BookPosition[],balances:Map<string,Prisma.Decimal>){
 const groups=new Map<string,BookPosition[]>();
 for(const p of positions){
  const key=bookKey(p.articuloId,p.ubicacionId);
  groups.set(key,[...(groups.get(key)??[]),p]);
 }
 const result=new Map<string,Prisma.Decimal>();
 for(const [key,group] of groups){
  const book=balances.get(key)??new Prisma.Decimal(0);
  const eligible=group.filter(x=>x.cantidad.greaterThan(0));
  const quantity=eligible.reduce((sum,x)=>sum.plus(x.cantidad),new Prisma.Decimal(0));
  let allocated=new Prisma.Decimal(0);
  for(let i=0;i<eligible.length;i++){
   const item=eligible[i];
   const value=i===eligible.length-1?book.minus(allocated):
    book.mul(item.cantidad).div(quantity).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
   result.set(item.id,value);allocated=allocated.plus(value);
  }
  for(const item of group)if(!result.has(item.id))result.set(item.id,new Prisma.Decimal(0));
 }
 return result;
}
