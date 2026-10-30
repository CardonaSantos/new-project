import {BadRequestException,ConflictException} from '@nestjs/common';

export type DeliveryState='PENDIENTE'|'EN_REPARTO'|'ENTREGADA'|'CANCELADA';
export const canTransition=(current:DeliveryState,next:DeliveryState)=>
 (current==='PENDIENTE'&&(next==='EN_REPARTO'||next==='CANCELADA'))||
 (current==='EN_REPARTO'&&(next==='ENTREGADA'||next==='CANCELADA'));

export function transition(current:DeliveryState,next:DeliveryState){
 if(!canTransition(current,next))
  throw new ConflictException('Transición de entrega no permitida');
}
export function snapshotAddress(raw:string){
 const value=raw.trim().replace(/\s+/g,' ');
 if(value.length<5||value.length>500)
  throw new BadRequestException('Dirección de entrega inválida');
 return value;
}
export function optionalText(value?:string|null):string|null|undefined{
 return value===undefined?undefined:value===null?null:value.trim()||null;
}
