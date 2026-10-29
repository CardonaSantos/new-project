
import {BadRequestException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
export function money(raw:string,zero=false):Prisma.Decimal{
 if(typeof raw!=='string'||!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(raw))
  throw new BadRequestException('Importe monetario inválido (hasta dos decimales)');
 const d=new Prisma.Decimal(raw);
 if(zero?d.lt(0):d.lte(0))throw new BadRequestException('Importe debe ser positivo');
 return d;
}
export const formatted=(d:Prisma.Decimal)=>d.toFixed(2);
export function ensureCoverage(total:Prisma.Decimal,paid:Prisma.Decimal){
 if(paid.gt(total))throw new ConflictException('Cobro excede el saldo de la cuenta');
}
export function operationalDate(now:Date,timeZone:string,cut:string):Date{
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cut))throw new BadRequestException('Hora de corte inválida');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const val=(key:string)=>parts.find(x=>x.type===key)?.value??'00';
 const y=Number(val('year')),m=Number(val('month')),d=Number(val('day'));
 const minutes=Number(val('hour'))*60+Number(val('minute'));
 const [h,min]=cut.split(':').map(Number);
 const date=new Date(Date.UTC(y,m-1,d));
 if(minutes<h*60+min)date.setUTCDate(date.getUTCDate()-1);
 return date;
}
export function assertShiftOperationalDate(fechaTurno:Date,now:Date,timeZone:string,cut:string){
 const current=operationalDate(now,timeZone,cut);
 if(fechaTurno.getTime()!==current.getTime())
  throw new ConflictException('Turno de otro día operativo; cierre el turno anterior y abra uno nuevo');
}
export function activeShift(actor:string,shift:{cajeroId:string;cerradaEn:Date|null;fondoInicial:Prisma.Decimal},
 allowOther=false){
 if(shift.cerradaEn)throw new ConflictException('Turno cerrado');
 if(!allowOther&&shift.cajeroId!==actor)throw new ConflictException('Turno pertenece a otro cajero');
 return shift;
}
