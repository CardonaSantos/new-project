import {BadRequestException,ConflictException} from '@nestjs/common';
import type {DeviceType} from './organization.types.js';

export function branchCode(value:string):string{
 const v=value.trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_-]{1,31}$/.test(v))throw new BadRequestException('Código de sucursal inválido');
 return v;
}
export function deviceCode(value:string):string{
 const v=value.trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_-]{1,31}$/.test(v))throw new BadRequestException('Código de dispositivo inválido');
 return v;
}
export function timezone(value:string):string{
 try {new Intl.DateTimeFormat('es-GT',{timeZone:value}).format(new Date());return value;}
 catch {throw new BadRequestException('Zona horaria IANA inválida');}
}
export function currency(value:string):string{
 const v=value.trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(v))throw new BadRequestException('Moneda ISO de tres letras requerida');
 return v;
}
export function cutoff(value:string):string{
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
  throw new BadRequestException('Hora de corte inválida (HH:mm)');
 return value;
}
export function deviceStationPolicy(tipo:DeviceType,station:string|null):void {
 if(station&&tipo!=='KDS')throw new ConflictException('Solo dispositivos KDS pueden vincularse a estaciones');
}
export function name(value:string):string{
 const result=value.trim();
 if(!result)throw new BadRequestException('El nombre no puede estar vacío');
 return result;
}
export function requireChanges(values:Record<string,unknown>):void {
 if(!Object.keys(values).length)throw new BadRequestException('No se enviaron campos para actualizar');
}
