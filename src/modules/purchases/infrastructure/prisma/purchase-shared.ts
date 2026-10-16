
import {createHash} from 'node:crypto';
import {ForbiddenException,ConflictException,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
export type Tx=Prisma.TransactionClient;
export type Actor=Principal;
export async function scope(tx:Tx,u:Actor,branch:string,perm:string){
 const grant=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
  {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:perm}}}}},
  {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:perm}}}}}
 ]}});
 if(!grant)throw new ForbiddenException('Permiso insuficiente en sucursal');
}
export async function globalScope(tx:Tx,u:Actor,perm:string){
 const grant=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},sucursalId:null,
  rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:perm}}}}}});
 if(!grant)throw new ForbiddenException('Permiso global requerido');
}
export async function audit(tx:Tx,u:Actor,branch:string|null,action:string,entity:string,id:string,details:Record<string,unknown>={}){
 await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:branch,accion:action,entidad:entity,entidadId:id,
  despues:details as Prisma.InputJsonValue}});
 await tx.eventoOutbox.create({data:{tipo:action,agregado:entity,agregadoId:id,
  payload:{sucursalId:branch,...details} as Prisma.InputJsonValue}});
}
export async function once<T extends Record<string,unknown>>(tx:Tx,u:Actor,key:string,action:string,payload:unknown,run:()=>Promise<T>):Promise<T>{
 if(!/^[\w:.-]{6,120}$/.test(key))throw new ConflictException('Clave idempotente inválida');
 const hash=createHash('sha256').update(JSON.stringify({actor:u.id,action,payload})).digest('hex');
 const prev=await tx.operacionIdempotente.findUnique({where:{clave:key}});
 if(prev){
  if(prev.hashSolicitud!==hash||prev.operacion!==action||!prev.finalizada||!prev.resultado)
   throw new ConflictException('Clave reutilizada con otros parámetros');
  return prev.resultado as T;
 }
 const result=await run();
 await tx.operacionIdempotente.create({data:{clave:key,operacion:action,hashSolicitud:hash,
  resultado:result as Prisma.InputJsonValue,finalizada:true,
  expiraEn:new Date(Date.now()+365*86400000)}});
 return result;
}
export async function atomic<T>(db:PrismaService,fn:(tx:Tx)=>Promise<T>):Promise<T>{
 for(let i=0;i<3;i++){
  try{return await db.$transaction(fn,{isolationLevel:'Serializable',timeout:20000});}
  catch(e){
   if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
    if(i<2)continue;
    throw new ConflictException('Conflicto concurrente: revise el documento y reintente');
   }
   throw e;
  }
 }
 throw new ConflictException('No se pudo confirmar la operación');
}
export async function branchOfWarehouse(tx:Tx,id:string){
 const w=await tx.almacen.findUnique({where:{id},include:{sucursal:true}});
 if(!w||!w.activo||!w.sucursal.activa)throw new NotFoundException('Almacén/sucursal no disponible');
 return w;
}
export const page=(q:{page?:number;limit?:number})=>({
 skip:((q.page??1)-1)*(q.limit??20),take:q.limit??20});
export const metadata=(count:number,q:{page?:number;limit?:number})=>({
 page:q.page??1,limit:q.limit??20,total:count,totalPages:Math.ceil(count/(q.limit??20))});
