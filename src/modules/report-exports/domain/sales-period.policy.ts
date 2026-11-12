import {BadRequestException} from '@nestjs/common';
// Separate from report-period.policy.ts (which only knows DIA/SEMANA/MES/PERSONALIZADO,
// shared by the 15 raw ticket sources): the sales report explicitly needs an ANIO option
// too, and adding it to the shared resolver would silently widen every other export's
// period selector as a side effect. Kept local to this one feature instead.
export type SalesPeriod='DIA'|'SEMANA'|'MES'|'ANIO'|'PERSONALIZADO';
export interface SalesPeriodInput{periodo:SalesPeriod;fecha?:string;desde?:string;hasta?:string}
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
function parse(day:string){
 if(!dayPattern.test(day))throw new BadRequestException('Fecha inválida (AAAA-MM-DD)');
 const d=new Date(day+'T00:00:00.000Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)
  throw new BadRequestException('Fecha inexistente');
 return d;
}
function textDay(d:Date){return d.toISOString().slice(0,10);}
function move(d:Date,n:number){return new Date(d.getTime()+n*86400000);}
export function resolveSalesPeriod(input:SalesPeriodInput,defaultDay:string){
 const date=parse(input.fecha??defaultDay);
 let first:Date,last:Date;
 switch(input.periodo){
  case 'DIA':first=date;last=date;break;
  case 'SEMANA':first=move(date,-((date.getUTCDay()+6)%7));last=move(first,6);break;
  case 'MES':first=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));
   last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0));break;
  case 'ANIO':first=new Date(Date.UTC(date.getUTCFullYear(),0,1));
   last=new Date(Date.UTC(date.getUTCFullYear(),11,31));break;
  case 'PERSONALIZADO':
   if(!input.desde||!input.hasta)throw new BadRequestException('Período personalizado requiere desde y hasta');
   first=parse(input.desde);last=parse(input.hasta);break;
  default:throw new BadRequestException('Período de reporte inválido');
 }
 if(last<first)throw new BadRequestException('Rango de fechas invertido');
 const n=Math.round((last.getTime()-first.getTime())/86400000)+1;
 if(n>366)throw new BadRequestException('Máximo 366 días por consulta de ventas');
 const days=Array.from({length:n},(_,i)=>textDay(move(first,i)));
 return {desde:days[0],hasta:days[days.length-1],dias:days};
}
