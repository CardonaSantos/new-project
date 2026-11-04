import {BadRequestException} from '@nestjs/common';
export interface SalesFilterInput{
 search?:string;desde?:string;hasta?:string;minTotal?:string;maxTotal?:string;
}
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
function validDay(text:string):Date{
 if(!dayPattern.test(text))throw new BadRequestException('Fecha inválida (AAAA-MM-DD)');
 const value=new Date(text+'T00:00:00.000Z');
 if(!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==text)
  throw new BadRequestException('Fecha inexistente');
 return value;
}
function zoneParts(date:Date,zone:string){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
  hourCycle:'h23'}).formatToParts(date);
 const v=(name:string)=>Number(parts.find(x=>x.type===name)?.value);
 return Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'),v('second'));
}
/** Convert branch-calendar midnight into UTC without imposing browser timezone.
 * Recalculation handles changes in IANA offsets across DST boundaries. */
export function branchMidnight(day:string,timezone:string):Date{
 const target=validDay(day).getTime();
 let guess=target;
 for(let i=0;i<4;i++){
  const delta=target-zoneParts(new Date(guess),timezone);
  if(!delta)break;
  guess+=delta;
 }
 return new Date(guess);
}
export function salesDateRange(input:SalesFilterInput,timezone:string){
 const from=input.desde?validDay(input.desde):null;
 const to=input.hasta?validDay(input.hasta):null;
 if(from&&to&&from.getTime()>to.getTime())
  throw new BadRequestException('La fecha inicial es posterior a la final');
 if(from&&to&&(to.getTime()-from.getTime())/86400000>366)
  throw new BadRequestException('El rango máximo de fechas es 367 días');
 const next=to?new Date(to.getTime()+86400000).toISOString().slice(0,10):null;
 return {gte:from?branchMidnight(input.desde!,timezone):undefined,
  lt:next?branchMidnight(next,timezone):undefined};
}
export function salesSearch(search?:string){
 const trimmed=search?.trim()??'';
 if(trimmed.length>100)throw new BadRequestException('Búsqueda demasiado larga');
 return trimmed;
}
