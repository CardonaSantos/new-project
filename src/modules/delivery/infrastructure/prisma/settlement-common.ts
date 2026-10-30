import {createHash} from 'node:crypto';
import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';

export type SettlementTx=Prisma.TransactionClient;
export const fmt=(v:Prisma.Decimal)=>v.toFixed(2);
export const dec=(v:string)=>new Prisma.Decimal(v);
export const zero=()=>new Prisma.Decimal(0);

@Injectable()
export class SettlementCommon{
 constructor(private readonly db:PrismaService){}
 async atomic<T>(run:(tx:SettlementTx)=>Promise<T>):Promise<T>{
  for(let i=0;i<3;i++){
   try{return await this.db.$transaction(run,{
    isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000
   });}catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
     if(i<2)continue;
     throw new ConflictException('Conflicto concurrente o pago ya liquidado');
    }
    throw e;
   }
  }
  throw new ConflictException('No se pudo completar la liquidación');
 }
 async has(tx:SettlementTx,u:Principal,branch:string,code:string){
  return !!await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}
  ]},select:{id:true}});
 }
 async require(tx:SettlementTx,u:Principal,branch:string,code:string){
  if(!await this.has(tx,u,branch,code))
   throw new ForbiddenException('Permiso insuficiente en la sucursal');
 }
 async branch(tx:SettlementTx,id:string){
  const b=await tx.sucursal.findUnique({where:{id},include:{configuracionSucursalesComoSucursal:true}});
  if(!b?.activa)throw new NotFoundException('Sucursal no disponible');
  return b;
 }
 async once(tx:SettlementTx,u:Principal,operation:string,key:string,payload:unknown,
  action:()=>Promise<Record<string,unknown>>):Promise<Record<string,unknown>>{
  const token='D3:'+u.id+':'+key;
  const digest=createHash('sha256').update(JSON.stringify({actor:u.id,operation,payload})).digest('hex');
  const prior=await tx.operacionIdempotente.findUnique({where:{clave:token}});
  if(prior){
   if(prior.operacion!==operation||prior.hashSolicitud!==digest||!prior.finalizada||!prior.resultado)
    throw new ConflictException('Clave idempotente reutilizada con otra operación');
   return prior.resultado as Record<string,unknown>;
  }
  const value=await action();
  await tx.operacionIdempotente.create({data:{clave:token,operacion:operation,
   hashSolicitud:digest,resultado:value as Prisma.InputJsonValue,
   finalizada:true,expiraEn:new Date(Date.now()+90*86400000)}});
  return value;
 }
 async audit(tx:SettlementTx,u:Principal,branch:string,action:string,entity:string,id:string,
  meta:Record<string,unknown>={}){
  await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:branch,
   accion:action,entidad:entity,entidadId:id,despues:meta as Prisma.InputJsonValue}});
  const {motivo:_reason,...eventMeta}=meta;
  void _reason;
  await tx.eventoOutbox.create({data:{tipo:action,agregado:entity,agregadoId:id,
   payload:{sucursalId:branch,...eventMeta} as Prisma.InputJsonValue}});
 }
}
