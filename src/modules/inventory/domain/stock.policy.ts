import {BadRequestException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
export type StockAmount=Prisma.Decimal;
const quantityPattern=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const costPattern=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
export function amount(v:string,allowZero=false):StockAmount{
 if(typeof v!=='string'||!quantityPattern.test(v))throw new BadRequestException('Cantidad requiere decimal positivo con hasta 6 posiciones');
 const n=new Prisma.Decimal(v);
 if(allowZero?n.lessThan(0):n.lessThanOrEqualTo(0))throw new BadRequestException('Cantidad fuera de rango');
 return n;
}
export function cost(v:string):StockAmount{
 if(typeof v!=='string'||!costPattern.test(v))throw new BadRequestException('Costo debe ser decimal no negativo con hasta 6 posiciones');
 return new Prisma.Decimal(v);
}
export function qty(v:StockAmount){return v.toFixed(6);}
export function price(v:StockAmount){return v.toFixed(6);}
export function combineAverage(q:StockAmount,unit:StockAmount,added:StockAmount,entryCost:StockAmount){
 const total=q.plus(added);
 if(total.isZero())return new Prisma.Decimal(0);
 return q.mul(unit).plus(added.mul(entryCost)).div(total).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
}
export function requireStock(current:StockAmount,requested:StockAmount){
 if(current.lessThan(requested))throw new ConflictException('Existencia insuficiente; no se permiten saldos negativos sin valoración definida');
}
export function localDate(now:Date,tz:string):string{
 try {return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 catch {throw new ConflictException('Zona horaria de sucursal inválida');}
}
export function validDay(v:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(new Date(v+'T00:00:00.000Z').getTime())||
    new Date(v+'T00:00:00.000Z').toISOString().slice(0,10)!==v)
  throw new BadRequestException('Fecha debe ser YYYY-MM-DD válida');
 return new Date(v+'T00:00:00.000Z');
}
export function requireReference(key:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{5,119}$/.test(key))
  throw new BadRequestException('claveOperacion debe contener 6-120 caracteres alfanuméricos o : _ . -');
 return key;
}
