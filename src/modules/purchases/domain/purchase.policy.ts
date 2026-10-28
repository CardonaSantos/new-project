
import {BadRequestException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
export type D=Prisma.Decimal;
export const dec=(s:string,scale=6,zero=false):D=>{
 if(typeof s!=='string'||!new RegExp('^(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,'+scale+'})?$').test(s))
  throw new BadRequestException('Cantidad monetaria/decimal inválida');
 const v=new Prisma.Decimal(s);
 if(zero?v.lt(0):v.lte(0))throw new BadRequestException('Se requiere cantidad positiva');
 return v;
};
export const cash=(s:string,zero=false)=>dec(s,2,zero);
export const f=(d:D,p=2)=>d.toFixed(p);
export const cents=(v:D)=>v.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
export function assertEq(a:D,b:D,message='Los totales no concilian'){
 if(!a.eq(b))throw new ConflictException(message);
}
export function covered(requested:D,available:D,message='Importe excede saldo disponible'){
 if(requested.gt(available))throw new ConflictException(message);
}
export function invoiceNumbers(s:string):string{
 const norm=s.trim().toUpperCase().replace(/\s+/g,' ');
 if(!norm||norm.length>100)throw new BadRequestException('Número documental inválido');
 return norm;
}
export function taxLine(q:D,unit:D,rate:D,included:boolean){
 if(rate.lt(0)||rate.gt(1))throw new BadRequestException('Tasa fuera de 0..1');
 const gross=cents(q.mul(unit));
 const base=included?cents(gross.div(rate.plus(1))):gross;
 const tax=included?gross.minus(base):cents(base.mul(rate));
 return {base,tax,total:base.plus(tax)};
}
