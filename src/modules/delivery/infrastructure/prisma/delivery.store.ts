import {createHash} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DeliveryPort} from '../../application/ports/delivery.port.js';
import type {DeliveryAction,DeliveryCancel,DeliveryAssign,DeliveryCreate,DeliveryDestination,DeliveryQuery} from '../../application/ports/delivery.port.js';
import {optionalText,snapshotAddress,transition} from '../../domain/delivery.policy.js';
import type {DeliveryState} from '../../domain/delivery.policy.js';

type Tx=Prisma.TransactionClient;
type DeliveryActionEvent='DELIVERY_CREATED'|'DELIVERY_ASSIGNED'|'DELIVERY_DESTINATION_CHANGED'|'DELIVERY_DISPATCHED'|'DELIVERY_COMPLETED'|'DELIVERY_CANCELLED';
const include={orden:{select:{id:true,numero:true,sucursalId:true,clienteId:true,modalidad:true,origen:true,estado:true,total:true}},
 repartidor:{select:{id:true,nombre:true}},canalExterno:{select:{id:true,codigo:true,nombre:true}}} as const;
type Detail=Prisma.EntregaGetPayload<{include:typeof include}>;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class DeliveryStore extends DeliveryPort{
 constructor(private readonly db:PrismaService){super();}
 private async atomic<T>(run:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<3;attempt++)try{
   return await this.db.$transaction(run,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});
  }catch(e){
   if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
    if(attempt<2)continue;
    throw new ConflictException('Entrega modificada concurrentemente o ya registrada');
   }
   throw e;
  }
  throw new ConflictException('No se pudo confirmar la entrega');
 }
 private async has(tx:Tx,userId:string,branch:string,code:string){
  return !!await tx.usuarioRol.findFirst({where:{usuarioId:userId,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}
  ]},select:{id:true}});
 }
 private async requireManage(tx:Tx,userId:string,branch:string){
  if(!await this.has(tx,userId,branch,'delivery.manage'))
   throw new ForbiddenException('No puede gestionar entregas en esta sucursal');
 }
 private async branch(tx:Tx,id:string){
  const row=await tx.sucursal.findUnique({where:{id},select:{activa:true}});
  if(!row?.activa)throw new NotFoundException('Sucursal no disponible');
 }
 private async courier(tx:Tx,userId:string,branch:string){
  if(!await this.has(tx,userId,branch,'delivery.courier')&&
     !await this.has(tx,userId,branch,'delivery.manage'))
   throw new ConflictException('Repartidor sin permiso activo en la sucursal');
 }
 private async canView(tx:Tx,u:Principal,branch:string,repartidorId:string|null){
  if(await this.has(tx,u.id,branch,'delivery.read')||
     await this.has(tx,u.id,branch,'delivery.manage'))return;
  if(repartidorId===u.id&&await this.has(tx,u.id,branch,'delivery.courier'))return;
  throw new ForbiddenException('Entrega no accesible en esta sucursal');
 }
 private async canProgress(tx:Tx,u:Principal,branch:string,repartidorId:string|null){
  if(await this.has(tx,u.id,branch,'delivery.manage'))return;
  if(repartidorId===u.id&&await this.has(tx,u.id,branch,'delivery.courier'))return;
  throw new ForbiddenException('Solo gestión o el repartidor asignado pueden avanzar la entrega');
 }
 private async get(tx:Tx,id:string):Promise<Detail>{
  const row=await tx.entrega.findUnique({where:{id},include});
  if(!row)throw new NotFoundException('Entrega inexistente');
  return row;
 }
 private async lock(tx:Tx,id:string){
  await tx.$queryRaw`SELECT "id" FROM "Entrega" WHERE "id"=${id} FOR UPDATE`;
  return this.get(tx,id);
 }
 private output(row:Detail){
  return {id:row.id,ordenId:row.ordenId,orden:row.orden,direccionId:row.direccionId,
   direccionTexto:row.direccionTexto,referenciaDireccion:row.referenciaDireccion,
   telefonoContacto:row.telefonoContacto,repartidorId:row.repartidorId,
   repartidor:row.repartidor,canalExternoId:row.canalExternoId,canalExterno:row.canalExterno,
   referenciaExterna:row.referenciaExterna,estado:row.estado,costoEnvio:row.costoEnvio.toFixed(2),
   cobrableContraEntrega:row.cobrableContraEntrega.toFixed(2),
   enRepartoEn:row.enRepartoEn,entregadaEn:row.entregadaEn,nota:row.nota};
 }
 private async event(tx:Tx,u:Principal,row:Detail,accion:DeliveryActionEvent,
  estadoAntes?:DeliveryState,repartidorAntesId?:string|null,motivo?:string){
  await tx.entregaEvento.create({data:{entregaId:row.id,usuarioId:u.id,accion,
   estadoAntes:estadoAntes??null,estadoDespues:row.estado,
   repartidorAntesId:repartidorAntesId??null,repartidorDespuesId:row.repartidorId,
   ...(motivo?{motivo}:{})}});
  // Generic audit/outbox never include address, phone, references or customer PII.
  await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:row.orden.sucursalId,
   accion,entidad:'Entrega',entidadId:row.id,
   despues:{estado:row.estado,repartidorId:row.repartidorId} as Prisma.InputJsonValue}});
  await tx.eventoOutbox.create({data:{tipo:accion,agregado:'Entrega',agregadoId:row.id,
   payload:{sucursalId:row.orden.sucursalId,ordenId:row.ordenId,
    estado:row.estado,repartidorId:row.repartidorId} as Prisma.InputJsonValue}});
 }
 private async once(tx:Tx,u:Principal,operation:string,key:string,payload:unknown,
  command:()=>Promise<{id:string}>):Promise<{id:string}>{
  const token='DEL:'+u.id+':'+key;
  const fingerprint=digest({actor:u.id,operation,payload});
  const prior=await tx.operacionIdempotente.findUnique({where:{clave:token}});
  if(prior){
   if(prior.operacion!==operation||prior.hashSolicitud!==fingerprint||!prior.finalizada||!prior.resultado)
    throw new ConflictException('Clave idempotente reutilizada con otro contenido');
   return prior.resultado as {id:string};
  }
  const result=await command();
  await tx.operacionIdempotente.create({data:{clave:token,operacion:operation,
   hashSolicitud:fingerprint,resultado:result as Prisma.InputJsonValue,
   finalizada:true,expiraEn:new Date(Date.now()+90*86400000)}});
  return result;
 }
 private async address(tx:Tx,clienteId:string|null,d:{
  direccionId?:string;direccionTexto?:string;referenciaDireccion?:string|null;telefonoContacto?:string|null
 }){
  if(Boolean(d.direccionId)===Boolean(d.direccionTexto))
   throw new BadRequestException('Indique direccionId o direccionTexto');
  if(d.direccionId){
   if(!clienteId)throw new ConflictException('La orden no tiene cliente asociado');
   const addr=await tx.direccionCliente.findFirst({where:{id:d.direccionId,clienteId,activa:true}});
   if(!addr)throw new NotFoundException('Dirección no disponible para este cliente');
   return {direccionId:addr.id,direccionTexto:snapshotAddress(addr.direccion),
    referenciaDireccion:d.referenciaDireccion!==undefined?optionalText(d.referenciaDireccion):addr.referencia,
    telefonoContacto:optionalText(d.telefonoContacto)??null};
  }
  return {direccionId:null,direccionTexto:snapshotAddress(d.direccionTexto!),
   referenciaDireccion:optionalText(d.referenciaDireccion)??null,
   telefonoContacto:optionalText(d.telefonoContacto)??null};
 }
 async list(u:Principal,q:DeliveryQuery){
  return this.atomic(async tx=>{
   await this.branch(tx,q.sucursalId);
   const manager=await this.has(tx,u.id,q.sucursalId,'delivery.read')||
    await this.has(tx,u.id,q.sucursalId,'delivery.manage');
   if(!manager&&!await this.has(tx,u.id,q.sucursalId,'delivery.courier'))
    throw new ForbiddenException('No puede consultar entregas');
   const where:Prisma.EntregaWhereInput={orden:{sucursalId:q.sucursalId},
    ...(q.estado?{estado:q.estado}:{}),
    ...(manager?(q.repartidorId?{repartidorId:q.repartidorId}:{}):{repartidorId:u.id})};
   const [rows,total]=await Promise.all([
    tx.entrega.findMany({where,include,orderBy:{id:'desc'},skip:(q.page-1)*q.limit,take:q.limit}),
    tx.entrega.count({where})
   ]);
   return {data:rows.map(row=>this.output(row)),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async detail(u:Principal,id:string){
  return this.atomic(async tx=>{
   const row=await this.get(tx,id);
   await this.canView(tx,u,row.orden.sucursalId,row.repartidorId);
   return this.output(row);
  });
 }
 async events(u:Principal,id:string){
  return this.atomic(async tx=>{
   const row=await this.get(tx,id);
   await this.canView(tx,u,row.orden.sucursalId,row.repartidorId);
   const data=await tx.entregaEvento.findMany({where:{entregaId:id},
    orderBy:[{creadoEn:'asc'},{id:'asc'}],
    select:{id:true,accion:true,estadoAntes:true,estadoDespues:true,
     usuarioId:true,repartidorAntesId:true,repartidorDespuesId:true,motivo:true,creadoEn:true}});
   return {data};
  });
 }
 async create(u:Principal,d:DeliveryCreate){
  const result=await this.atomic(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Orden" WHERE "id"=${d.ordenId} FOR SHARE`;
   const order=await tx.orden.findUnique({where:{id:d.ordenId},
    select:{id:true,sucursalId:true,clienteId:true,modalidad:true,estado:true,origen:true}});
   if(!order)throw new NotFoundException('Orden inexistente');
   await this.requireManage(tx,u.id,order.sucursalId);
   await this.branch(tx,order.sucursalId);
   return this.once(tx,u,'DELIVERY_CREATE',d.claveOperacion,d,async()=>{
    if(order.modalidad!=='DELIVERY'||order.estado==='CANCELADA')
     throw new ConflictException('Solo se acepta orden DELIVERY vigente');
    if(await tx.entrega.findUnique({where:{ordenId:order.id},select:{id:true}}))
     throw new ConflictException('La orden ya tiene una entrega');
    const address=await this.address(tx,order.clienteId,d);
    if(d.repartidorId)await this.courier(tx,d.repartidorId,order.sucursalId);
    if(d.canalExternoId&&order.origen!=='PLATAFORMA')
     throw new ConflictException('El canal externo requiere origen PLATAFORMA');
    if(order.origen==='PLATAFORMA'&&!d.canalExternoId)
     throw new BadRequestException('Origen PLATAFORMA requiere canalExternoId');
    if(d.canalExternoId){
     const channel=await tx.canalExterno.findUnique({where:{id:d.canalExternoId}});
     if(!channel?.activo)throw new NotFoundException('Canal externo no disponible');
    }
    const created=await tx.entrega.create({data:{
     ordenId:order.id,...address,repartidorId:d.repartidorId??null,
     canalExternoId:d.canalExternoId??null,
     referenciaExterna:optionalText(d.referenciaExterna)??null,
     costoEnvio:new Prisma.Decimal(0),cobrableContraEntrega:new Prisma.Decimal(0)
    }});
    const row=await this.get(tx,created.id);
    await this.event(tx,u,row,'DELIVERY_CREATED');
    return {id:created.id};
   });
  });
  return this.detail(u,result.id);
 }
 async destination(u:Principal,id:string,d:DeliveryDestination){
  const result=await this.atomic(async tx=>{
   const before=await this.get(tx,id);
   await this.requireManage(tx,u.id,before.orden.sucursalId);
   return this.once(tx,u,'DELIVERY_DESTINATION',d.claveOperacion,{id,...d},async()=>{
    const row=await this.lock(tx,id);
    if(row.estado!=='PENDIENTE')throw new ConflictException('Destino editable solo antes de salir');
    const address=await this.address(tx,row.orden.clienteId,d);
    // PATCH semantics: omitted contact fields must not clear historic contact data.
    // Explicit null can intentionally clear a value.
    const changes={
     ...address,
     ...(d.telefonoContacto===undefined?{telefonoContacto:row.telefonoContacto}:{}),
     ...(d.referenciaDireccion===undefined&&!d.direccionId?
       {referenciaDireccion:row.referenciaDireccion}:{})
    };
    await tx.entrega.update({where:{id},data:changes});
    await this.event(tx,u,await this.get(tx,id),'DELIVERY_DESTINATION_CHANGED',row.estado,row.repartidorId);
    return {id};
   });
  });
  return this.detail(u,result.id);
 }
 async assign(u:Principal,id:string,d:DeliveryAssign){
  const result=await this.atomic(async tx=>{
   const before=await this.get(tx,id);
   await this.requireManage(tx,u.id,before.orden.sucursalId);
   return this.once(tx,u,'DELIVERY_ASSIGN',d.claveOperacion,{id,...d},async()=>{
    const row=await this.lock(tx,id);
    if(row.estado==='ENTREGADA'||row.estado==='CANCELADA')
     throw new ConflictException('Entrega finalizada; no se puede reasignar');
    if(row.orden.estado==='CANCELADA')throw new ConflictException('Orden cancelada');
    await this.courier(tx,d.repartidorId,row.orden.sucursalId);
    if(row.repartidorId!==d.repartidorId){
     if(await tx.pago.count({where:{recibidoPorRepartidor:true,
      cuenta:{ordenId:row.ordenId}}}))
      throw new ConflictException('La entrega tiene efectivo cobrado; no se puede reasignar');
     await tx.entrega.update({where:{id},data:{repartidorId:d.repartidorId}});
     await this.event(tx,u,await this.get(tx,id),'DELIVERY_ASSIGNED',row.estado,row.repartidorId);
    }
    return {id};
   });
  });
  return this.detail(u,result.id);
 }
 private async advance(u:Principal,id:string,d:DeliveryAction,
  action:'DELIVERY_DISPATCHED'|'DELIVERY_COMPLETED',from:DeliveryState,to:DeliveryState){
  const result=await this.atomic(async tx=>{
   const before=await this.get(tx,id);
   await this.canProgress(tx,u,before.orden.sucursalId,before.repartidorId);
   return this.once(tx,u,action,d.claveOperacion,{id,...d},async()=>{
    const row=await this.lock(tx,id);
    await this.canProgress(tx,u,row.orden.sucursalId,row.repartidorId);
    if(row.orden.estado==='CANCELADA')throw new ConflictException('Orden cancelada');
    transition(row.estado,to);
    if(row.estado!==from)throw new ConflictException('Estado inicial incorrecto');
    if(!row.repartidorId)throw new ConflictException('Asigne repartidor antes de salir');
    await tx.entrega.update({where:{id},data:{estado:to,
     ...(to==='EN_REPARTO'?{enRepartoEn:new Date()}:{entregadaEn:new Date()})}});
    await this.event(tx,u,await this.get(tx,id),action,row.estado,row.repartidorId);
    return {id};
   });
  });
  return this.detail(u,result.id);
 }
 dispatch(u:Principal,id:string,d:DeliveryAction){return this.advance(u,id,d,'DELIVERY_DISPATCHED','PENDIENTE','EN_REPARTO');}
 complete(u:Principal,id:string,d:DeliveryAction){return this.advance(u,id,d,'DELIVERY_COMPLETED','EN_REPARTO','ENTREGADA');}
 async cancel(u:Principal,id:string,d:DeliveryCancel){
  const result=await this.atomic(async tx=>{
   const before=await this.get(tx,id);
   await this.requireManage(tx,u.id,before.orden.sucursalId);
   return this.once(tx,u,'DELIVERY_CANCEL',d.claveOperacion,{id,...d},async()=>{
    const row=await this.lock(tx,id);
    transition(row.estado,'CANCELADA');
    if(await tx.pago.count({where:{cuenta:{ordenId:row.ordenId}}}))
     throw new ConflictException('La orden tiene pagos; revise el cobro antes de cancelar');
    await tx.entrega.update({where:{id},data:{estado:'CANCELADA'}});
    await this.event(tx,u,await this.get(tx,id),'DELIVERY_CANCELLED',row.estado,row.repartidorId,d.motivo.trim());
    return {id};
   });
  });
  return this.detail(u,result.id);
 }
}
