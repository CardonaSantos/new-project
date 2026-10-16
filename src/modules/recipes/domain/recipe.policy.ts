import {BadRequestException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';

export const quantity=(value:string,zero=false)=>{
 if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(value))
  throw new BadRequestException('Cantidad decimal inválida (máximo 6 decimales)');
 const d=new Prisma.Decimal(value);
 if(zero?d.lt(0):d.lte(0))throw new BadRequestException('La cantidad debe ser positiva');
 return d;
};
export const money=(v:Prisma.Decimal)=>v.toFixed(6);
export const proportion=(v:string)=>{
 const d=quantity(v,true);
 if(d.gte(100))throw new BadRequestException('La merma debe ser inferior a 100%');
 return d;
};
export function gross(net:Prisma.Decimal,loss:Prisma.Decimal){
 return net.div(new Prisma.Decimal(1).minus(loss.div(100)))
  .toDecimalPlaces(6,Prisma.Decimal.ROUND_CEIL);
}
export function demand(component:{cantidad:Prisma.Decimal;mermaPorcentaje:Prisma.Decimal},
 factor:Prisma.Decimal){
 return gross(component.cantidad.mul(factor),component.mermaPorcentaje);
}
export function ensureUnique<T>(rows:T[],key:(value:T)=>string,label:string){
 const ids=rows.map(key);
 if(new Set(ids).size!==ids.length)throw new ConflictException(label+' duplicado');
}
export function validCode(s:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{5,119}$/.test(s))
  throw new BadRequestException('claveOperacion inválida');
 return s;
}
export function isDate(v:string){
 const d=new Date(v+'T00:00:00.000Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(d.getTime())||
  d.toISOString().slice(0,10)!==v)throw new BadRequestException('Fecha inválida YYYY-MM-DD');
 return d;
}
