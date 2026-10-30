import {BadRequestException,ConflictException} from '@nestjs/common';
export type ReservationStatus='PENDIENTE'|'CONFIRMADA'|'CANCELADA'|'COMPLETADA'|'NO_ASISTIO';
export function validateWindow(start:string,end:string,now=new Date()){
 const a=new Date(start),z=new Date(end);
 if(!Number.isFinite(a.valueOf())||!Number.isFinite(z.valueOf())||z<=a)
  throw new BadRequestException('El horario de la reserva es inválido');
 const minutes=(z.valueOf()-a.valueOf())/60000;
 if(minutes<15||minutes>12*60)throw new BadRequestException('Duración entre 15 minutos y 12 horas');
 if(a.getTime()<now.getTime()-5*60000)throw new ConflictException('No se aceptan reservas en el pasado');
 if(a.getTime()>now.getTime()+366*86400000)throw new BadRequestException('Anticipación máxima 366 días');
 return {inicio:a,fin:z};
}
export function requireEditable(status:ReservationStatus){
 if(status!=='PENDIENTE'&&status!=='CONFIRMADA')
  throw new ConflictException('Reserva finalizada; no se puede modificar');
}
export function validateCapacity(capacities:number[],persons:number){
 if(!capacities.length||capacities.reduce((sum,v)=>sum+v,0)<persons)
  throw new ConflictException('Las mesas no tienen capacidad para los comensales');
}
export function checkInWindow(start:Date,end:Date,now=new Date()){
 if(now.getTime()<start.getTime()-30*60000)
  throw new ConflictException('Check-in disponible desde 30 minutos antes');
 if(now>=end)throw new ConflictException('Reserva vencida; registre no asistencia');
}
export function noShowWindow(start:Date,now=new Date()){
 if(now.getTime()<start.getTime()+15*60000)
  throw new ConflictException('Espere 15 minutos desde el inicio para registrar no asistencia');
}

// COMPLETADA is the persisted attendance/check-in state. For UI, distinguish
// whether the restaurant is still serving the checked-in guest.
export function servicePhase(status:ReservationStatus,hasOpenOccupation:boolean){
 if(status==='COMPLETADA')return hasOpenOccupation?'EN_MESA':'ATENCION_FINALIZADA';
 if(status==='NO_ASISTIO')return 'NO_ASISTIO';
 if(status==='CANCELADA')return 'CANCELADA';
 return status;
}
