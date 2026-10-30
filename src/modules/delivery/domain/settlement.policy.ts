import {BadRequestException,ConflictException} from '@nestjs/common';

export const amountPattern=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
export function dateOnly(raw:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw new BadRequestException('Fecha inválida');
 const value=new Date(raw+'T00:00:00.000Z');
 if(!Number.isFinite(value.valueOf())||value.toISOString().slice(0,10)!==raw)
  throw new BadRequestException('Fecha inválida');
 return value;
}
export function ensureExactCash(expected:string,delivered:string){
 if(expected!==delivered)throw new ConflictException(
  'Efectivo entregado distinto del esperado; registrar incidencia antes de cierre');
}
