import {BadRequestException,ConflictException} from '@nestjs/common';
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function parseDay(day:string){
 if(!datePattern.test(day))throw new BadRequestException('Fecha operativa inválida');
 const value=new Date(day+'T00:00:00.000Z');
 if(!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==day)
  throw new BadRequestException('Fecha operativa inexistente');
 return value;
}
function localParts(time:Date,timeZone:string){
 const entries=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time);
 const part=(key:string)=>Number(entries.find(p=>p.type===key)?.value??0);
 return {year:part('year'),month:part('month'),day:part('day'),
  hour:part('hour'),minute:part('minute')};
}
function utcForLocal(day:Date,cut:string,zone:string){
 const [h,m]=cut.split(':').map(Number);
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cut))
  throw new BadRequestException('Hora de corte inválida');
 const requested=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),h,m);
 let timestamp=requested;
 for(let i=0;i<5;i++){
  const p=localParts(new Date(timestamp),zone);
  const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
  const offset=requested-represented;
  if(!offset)break;
  timestamp+=offset;
 }
 const check=localParts(new Date(timestamp),zone);
 if(check.year!==day.getUTCFullYear()||check.month!==day.getUTCMonth()+1||
  check.day!==day.getUTCDate()||check.hour!==h||check.minute!==m)
  throw new BadRequestException('Hora de corte inexistente o ambigua en zona horaria');
 return new Date(timestamp);
}
export function financialBusinessWindow(day:string,zone:string,cut:string){
 const value=parseDay(day);
 const next=new Date(value.getTime()+86400000);
 const from=utcForLocal(value,cut,zone),to=utcForLocal(next,cut,zone);
 if(from>=to)throw new BadRequestException('Zona horaria o período inválido');
 return {date:value,from,to};
}
export function ensureCloseEligible(target:Date,current:Date,openShifts:number,openOrders:number){
 if(target>=current)throw new ConflictException('Solo se cierran días operativos anteriores al actual');
 if(openShifts)throw new ConflictException('Hay turnos de caja abiertos para este día');
 if(openOrders)throw new ConflictException('Hay órdenes del día pendientes de cierre');
}
