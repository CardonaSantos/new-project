
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
export type Tx=Prisma.TransactionClient;
export async function allowed(tx:Tx,u:Principal,sucursalId:string,permission:string){
 const permitted=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},
  OR:[{sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}},
  {sucursalId,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}}]}});
 if(!permitted)throw new ForbiddenException('Permiso insuficiente en sucursal');
}
export function operationKey(value:string){
 if(!/^[A-Za-z0-9][A-Za-z0-9:_.-]{5,119}$/.test(value))
  throw new BadRequestException('claveOperacion inválida');
 return value;
}
export async function runOnce<T extends Record<string,unknown>>(tx:Tx,u:Principal,clave:string,
 operation:string,payload:unknown,run:()=>Promise<T>):Promise<T>{
 operationKey(clave);
 const hash=createHash('sha256').update(JSON.stringify({actor:u.id,operation,payload})).digest('hex');
 const old=await tx.operacionIdempotente.findUnique({where:{clave}});
 if(old){
  if(old.hashSolicitud!==hash||old.operacion!==operation||!old.finalizada||!old.resultado)
   throw new ConflictException('Clave idempotente reutilizada o aún pendiente');
  return old.resultado as T;
 }
 const value=await run();
 await tx.operacionIdempotente.create({data:{clave,operacion:operation,hashSolicitud:hash,
  resultado:value as Prisma.InputJsonValue,finalizada:true,
  expiraEn:new Date(Date.now()+90*86400000)}});
 return value;
}
export async function audit(tx:Tx,u:Principal,sucursalId:string,action:string,entity:string,id:string,
 details:Record<string,unknown>={}){
 await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId,
  accion:action,entidad:entity,entidadId:id,despues:details as Prisma.InputJsonValue}});
 await tx.eventoOutbox.create({data:{tipo:action,agregado:entity,agregadoId:id,
  payload:{sucursalId} as Prisma.InputJsonValue}});
}
export async function orderForAccount(tx:Tx,accountId:string){
 const account=await tx.cuenta.findUnique({where:{id:accountId},
  include:{orden:{include:{sucursal:true}}}});
 if(!account)throw new NotFoundException('Cuenta inexistente');
 if(!account.orden.sucursal.activa)throw new ConflictException('Sucursal inactiva');
 return account;
}
export async function txSerializable<T>(db:PrismaService,fn:(tx:Tx)=>Promise<T>):Promise<T>{
 try{return await db.$transaction(fn,{isolationLevel:'Serializable'});}
 catch(e){
  if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code))
   throw new ConflictException('Operación concurrente: consulte saldo y reintente con la misma clave');
  throw e;
 }
}
