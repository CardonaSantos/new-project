import {ConflictException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {key,sha} from '../../domain/order.policy.js';
export type Tx=Prisma.TransactionClient;
export const orderInclude={
 ordenLineasComoOrden:{orderBy:{creadaEn:'asc' as const},include:{
  variante:{select:{id:true,sku:true,nombre:true,producto:{select:{nombre:true,tipo:true}}}},
  ordenLineaModificadoresComoOrdenLinea:true,
  comandaLineasComoOrdenLinea:{select:{id:true,comandaId:true,cantidad:true,
   cantidadPreparada:true,listaEn:true,entregadaEn:true,canceladaEn:true}}}},
 cuentasComoOrden:{include:{cuentaLineasComoCuenta:true}},
 ocupacionMesa:{include:{mesa:{include:{sala:true}}}},
 comandasComoOrden:{select:{id:true,numero:true,estado:true,estacionId:true,enviadaEn:true}}
} as const;
export const ticketInclude={
 estacion:{select:{id:true,nombre:true,ubicacionConsumoId:true}},
 orden:{select:{id:true,numero:true,modalidad:true,estado:true,observaciones:true,
  ocupacionMesa:{select:{mesa:{select:{numero:true}}}}}},
 comandaLineasComoComanda:{include:{
  ordenLinea:{include:{ordenLineaModificadoresComoOrdenLinea:true,
   variante:{select:{id:true,nombre:true,producto:{select:{nombre:true,tipo:true}}}}}}
 }}
} as const;

export async function audit(tx:Tx,u:Principal,action:string,entity:string,id:string,
 branch:string,data?:Record<string,unknown>,motivo?:string){
 await tx.eventoAuditoria.create({data:{
  usuarioId:u.id,sucursalId:branch,accion:action,entidad:entity,entidadId:id,
  motivo,...(data?{despues:data as Prisma.InputJsonValue}:{})
 }});
}
export async function outbox(tx:Tx,type:string,entity:string,id:string,branch:string,detail:Record<string,unknown>={}){
 await tx.eventoOutbox.create({data:{
  tipo:type,agregado:entity,agregadoId:id,payload:{sucursalId:branch,...detail} as Prisma.InputJsonValue
 }});
}
export async function runOnce<T extends Record<string,unknown>>(tx:Tx,u:Principal,
 inputKey:string,action:string,payload:unknown,run:()=>Promise<T>):Promise<T>{
 const clave=key(inputKey),hash=sha({actor:u.id,action,payload});
 const existing=await tx.operacionIdempotente.findUnique({where:{clave}});
 if(existing){
  if(existing.hashSolicitud!==hash||existing.operacion!==action||!existing.finalizada||!existing.resultado)
   throw new ConflictException('Clave idempotente reutilizada con otros datos o pendiente');
  return existing.resultado as T;
 }
 const result=await run();
 await tx.operacionIdempotente.create({data:{
  clave,operacion:action,hashSolicitud:hash,resultado:result as Prisma.InputJsonValue,
  finalizada:true,expiraEn:new Date(Date.now()+1000*60*60*24*90)
 }});
 return result;
}
