import {BadRequestException,ConflictException} from '@nestjs/common';
export type CatalogProductType='PREPARADO'|'INVENTARIABLE'|'SERVICIO';
export type PublicationDiagnostic={codigo:string;detalle:string};
export function catalogCode(raw:string):string{
 const v=raw.trim().toUpperCase();if(!/^[A-Z][A-Z0-9_-]{0,49}$/.test(v))throw new BadRequestException('Código inválido');return v;
}
export function catalogName(raw:string):string{
 const v=raw.trim();if(!v)throw new BadRequestException('Nombre requerido');return v;
}
export function decimalPrice(raw:string):string{
 if(!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(raw))throw new BadRequestException('Importe decimal inválido');return raw;
}
export function bounds(min:number,max?:number|null):void{
 if(!Number.isSafeInteger(min)||min<0||max!==null&&max!==undefined&&
 (!Number.isSafeInteger(max)||max<min))throw new ConflictException('Límites de selección inconsistentes');
}
export function period(from:Date,to?:Date|null):void{
 if(Number.isNaN(from.getTime())||to&&Number.isNaN(to.getTime())||to&&to<=from)
 throw new BadRequestException('Vigencia inválida: fin debe ser posterior a inicio');
}
export function clock(value:string):string{
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw new BadRequestException('Hora inválida HH:mm');return value;
}
export function validSchedule(day:number,start:string,end:string):void{
 clock(start);clock(end);
 if(!Number.isInteger(day)||day<0||day>6||start>=end)throw new BadRequestException('Horario inválido');
}
export function requirePatch(value:object){if(!Object.keys(value).length)throw new BadRequestException('Sin cambios');}
export function requireInventoryLink(tipo:CatalogProductType,articleId:string|null|undefined):void{
 if(tipo==='INVENTARIABLE'&&!articleId)throw new ConflictException('Variante inventariable necesita un artículo físico');
 if(tipo!=='INVENTARIABLE'&&articleId)throw new ConflictException('Solo la variante INVENTARIABLE puede vincular artículo físico directamente');
}
export function hourAt(date:Date,zone:string):{day:number;time:string}{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
 const value=(t:string)=>p.find(x=>x.type===t)?.value??'';
 const days:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 const hour=value('hour')==='24'?'00':value('hour');
 return {day:days[value('weekday')]??-1,time:`${hour}:${value('minute')}`};
}
