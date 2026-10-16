import {BadRequestException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
export const orderQty=(value:string)=>{
 const d=new Prisma.Decimal(value);
 if(!d.isFinite()||d.lte(0)||d.decimalPlaces()>3||d.gte('100000000000'))
  throw new BadRequestException('Cantidad inválida');
 return d;
};
export const cents=(value:Prisma.Decimal)=>value.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
export const cash=(value:Prisma.Decimal)=>value.toFixed(2);
export function unique<T>(items:T[],key:(item:T)=>string,message:string){
 if(new Set(items.map(key)).size!==items.length)throw new ConflictException(message);
}
export function assertRoute(variant:boolean,category:boolean){
 if(variant===category)throw new BadRequestException('Ruta requiere exactamente una variante o categoría');
}
