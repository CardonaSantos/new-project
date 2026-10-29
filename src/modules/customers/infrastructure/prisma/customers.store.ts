import {createHash} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CustomersPort,CustomerSelectionPort} from '../../application/ports/customers.port.js';
import type {BranchCommand,CustomerQuery,CustomerCreate,CustomerUpdate,AddressCreate,AddressUpdate}
 from '../../application/ports/customers.port.js';
import {cleanOptional,coordinate,normalizeCustomerName,CustomerPolicyError} from '../../domain/customer.policy.js';

type Tx=Prisma.TransactionClient;
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000};
const scope=(branch:string):Prisma.ClienteWhereInput=>({OR:[
 {clienteSucursalesComoCliente:{some:{sucursalId:branch}}},
 {ordenesComoCliente:{some:{sucursalId:branch}}},
 {ventasComoCliente:{some:{sucursalId:branch}}},
 {reservasComoCliente:{some:{sucursalId:branch}}}
]});
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const meta=(page:number,limit:number,total:number)=>({page,limit,total,totalPages:Math.ceil(total/limit)});
function policy<T>(fn:()=>T):T{
 try{return fn();}catch(error){
  if(error instanceof CustomerPolicyError)throw new BadRequestException(error.message);
  throw error;
 }
}

@Injectable()
export class CustomersStore extends CustomersPort implements CustomerSelectionPort{
 constructor(private readonly db:PrismaService){super();}
 private async atomic<T>(run:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<3;attempt++){
   try{return await this.db.$transaction(run,serializable);}
   catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
     if(attempt<2)continue;
     throw new ConflictException('Conflicto concurrente o restricción de unicidad');
    }
    throw e;
   }
  }
  throw new ConflictException('No se pudo completar la operación');
 }
 private async has(tx:Tx,actorId:string,branch:string,code:string,globalOnly=false){
  return !!await tx.usuarioRol.findFirst({where:{usuarioId:actorId,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   ...(globalOnly?[]:[{sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL' as const,
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}])
  ]},select:{id:true}});
 }
 private async require(tx:Tx,actorId:string,branch:string,permission:string){
  if(!await this.has(tx,actorId,branch,permission))
   throw new ForbiddenException('Permiso insuficiente en la sucursal');
 }
 private async branch(tx:Tx,id:string){
  const b=await tx.sucursal.findUnique({where:{id},select:{id:true,activa:true}});
  if(!b?.activa)throw new NotFoundException('Sucursal no disponible');
 }
 private async visibleCustomer(tx:Tx,actorId:string,id:string,branch:string){
  const elevated=await this.has(tx,actorId,branch,'customers.global.manage',true);
  const row=await tx.cliente.findFirst({where:{id,...(elevated?{}:scope(branch))}});
  if(!row)throw new NotFoundException('Cliente no disponible en esta sucursal');
  return row;
 }
 private async editableCustomer(tx:Tx,actorId:string,id:string,branch:string){
  await this.lockCustomer(tx,id);
  const row=await this.visibleCustomer(tx,actorId,id,branch);
  const [links,orders,sales,reservations]=await Promise.all([
   tx.clienteSucursal.findMany({where:{clienteId:id},select:{sucursalId:true}}),
   tx.orden.findMany({where:{clienteId:id},distinct:['sucursalId'],select:{sucursalId:true}}),
   tx.venta.findMany({where:{clienteId:id},distinct:['sucursalId'],select:{sucursalId:true}}),
   tx.reserva.findMany({where:{clienteId:id},distinct:['sucursalId'],select:{sucursalId:true}})
  ]);
  const branches=new Set([...links,...orders,...sales,...reservations].map(x=>x.sucursalId));
  if(branches.size>1&&!await this.has(tx,actorId,branch,'customers.global.manage',true))
   throw new ForbiddenException('El cliente compartido requiere autorización global');
  return row;
 }
 private async once<T extends {id:string}>(tx:Tx,actor:Principal,operation:string,
  input:BranchCommand,payload:unknown,run:()=>Promise<T>):Promise<T>{
  const operationKey='CUS:'+actor.id+':'+input.claveOperacion;
  const requestHash=digest({actor:actor.id,operation,payload});
  const previous=await tx.operacionIdempotente.findUnique({where:{clave:operationKey}});
  if(previous){
   if(previous.operacion!==operation||previous.hashSolicitud!==requestHash||
      !previous.finalizada||!previous.resultado)
    throw new ConflictException('Clave idempotente reutilizada con otro contenido');
   return previous.resultado as T;
  }
  const result=await run();
  await tx.operacionIdempotente.create({data:{
   clave:operationKey,operacion:operation,hashSolicitud:requestHash,
   finalizada:true,resultado:result as Prisma.InputJsonValue,
   expiraEn:new Date(Date.now()+90*86400000)
  }});
  return result;
 }
 private async event(tx:Tx,actor:Principal,branch:string,action:string,entity:string,id:string,
  fields:string[]=[]){
  // Nunca persistir NIT, teléfono, email, coordenadas, dirección ni notas en los eventos.
  await tx.eventoAuditoria.create({data:{usuarioId:actor.id,sucursalId:branch,
   accion:action,entidad:entity,entidadId:id,
   despues:{fields} as Prisma.InputJsonValue}});
  await tx.eventoOutbox.create({data:{tipo:action,agregado:entity,agregadoId:id,
   payload:{sucursalId:branch,accion:action} as Prisma.InputJsonValue}});
 }
 private async lockCustomer(tx:Tx,id:string){
  await tx.$queryRaw`SELECT "id" FROM "Cliente" WHERE "id"=${id} FOR UPDATE`;
 }
 private async address(tx:Tx,customerId:string,addressId:string){
  const row=await tx.direccionCliente.findFirst({where:{id:addressId,clienteId:customerId,activa:true}});
  if(!row)throw new NotFoundException('Dirección no disponible');
  return row;
 }
 private addressData(d:{alias?:string|null;direccion?:string;referencia?:string|null;
  latitud?:string|null;longitud?:string|null}){
  return policy(()=>{
   if(d.direccion!==undefined&&d.direccion.trim().length<5)
    throw new CustomerPolicyError('Dirección demasiado corta');
   return ({
   ...(d.alias!==undefined?{alias:cleanOptional(d.alias)}:{}),
   ...(d.direccion!==undefined?{direccion:d.direccion.trim()}:{}),
   ...(d.referencia!==undefined?{referencia:cleanOptional(d.referencia)}:{}),
   ...(d.latitud!==undefined?{latitud:coordinate(d.latitud,'latitud')}:{}),
   ...(d.longitud!==undefined?{longitud:coordinate(d.longitud,'longitud')}:{})
   });
  });
 }
 async assertSelectable(actorId:string,branchId:string,clienteId:string):Promise<void>{
  await this.atomic(async tx=>{
   await this.require(tx,actorId,branchId,'customers.read');
   await this.branch(tx,branchId);
   const customer=await this.visibleCustomer(tx,actorId,clienteId,branchId);
   if(!customer.activo)throw new ConflictException('Cliente inactivo');
  });
 }
 async list(actor:Principal,q:CustomerQuery){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,q.sucursalId,'customers.read');
   await this.branch(tx,q.sucursalId);
   const elevated=await this.has(tx,actor.id,q.sucursalId,'customers.global.manage',true);
   const filters:Prisma.ClienteWhereInput={
    ...(q.activo===undefined?{}:{activo:q.activo}),
    ...(q.search?.trim()?{OR:[
     {nombre:{contains:q.search.trim(),mode:'insensitive'}},
     {telefono:{contains:q.search.trim()}},
     {nit:{contains:q.search.trim(),mode:'insensitive'}}
    ]}:{})
   };
   const scoped:Prisma.ClienteWhereInput=elevated?filters:{AND:[scope(q.sucursalId),filters]};
   const [rows,total]=await Promise.all([
    tx.cliente.findMany({where:scoped,orderBy:[{creadoEn:'desc'},{id:'desc'}],
     skip:(q.page-1)*q.limit,take:q.limit,
     select:{id:true,nombre:true,telefono:true,email:true,nit:true,activo:true,creadoEn:true}}),
    tx.cliente.count({where:scoped})
   ]);
   return {data:rows,meta:meta(q.page,q.limit,total)};
  });
 }
 async detail(actor:Principal,id:string,branchId:string){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,branchId,'customers.read');
   await this.branch(tx,branchId);
   const row=await this.visibleCustomer(tx,actor.id,id,branchId);
   return {id:row.id,nombre:row.nombre,nit:row.nit,telefono:row.telefono,
    email:row.email,notas:row.notas,activo:row.activo,creadoEn:row.creadoEn};
  });
 }
 async create(actor:Principal,d:CustomerCreate){
  const input=policy(()=>({nombre:normalizeCustomerName(d.nombre),nit:cleanOptional(d.nit),
   telefono:cleanOptional(d.telefono),email:cleanOptional(d.email)?.toLowerCase()??cleanOptional(d.email),
   notas:cleanOptional(d.notas)}));
  const result=await this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.create');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_CREATE',d,d,async()=>{
    const row=await tx.cliente.create({data:input});
    await tx.clienteSucursal.create({data:{clienteId:row.id,sucursalId:d.sucursalId}});
    await this.event(tx,actor,d.sucursalId,'CUSTOMER_CREATED','Cliente',row.id);
    return {id:row.id};
   });
  });
  return this.detailForMutation(actor,result.id,d.sucursalId);
 }
 private async detailForMutation(actor:Principal,id:string,branch:string){
  // El permiso de escritura autoriza devolver el registro recién afectado,
  // aunque el rol no disponga del permiso independiente de lectura.
  return this.atomic(async tx=>{
   const mayReadResult=await this.has(tx,actor.id,branch,'customers.create')||
    await this.has(tx,actor.id,branch,'customers.manage');
   if(!mayReadResult)throw new ForbiddenException('Permiso de clientes insuficiente');
   const row=await this.visibleCustomer(tx,actor.id,id,branch);
   return {id:row.id,nombre:row.nombre,nit:row.nit,telefono:row.telefono,
    email:row.email,notas:row.notas,activo:row.activo,creadoEn:row.creadoEn};
  });
 }
 async update(actor:Principal,id:string,d:CustomerUpdate){
  const changes=policy(()=>{
   const data:Prisma.ClienteUpdateInput={};
   if(d.nombre!==undefined)data.nombre=normalizeCustomerName(d.nombre);
   if(d.nit!==undefined)data.nit=cleanOptional(d.nit);
   if(d.telefono!==undefined)data.telefono=cleanOptional(d.telefono);
   if(d.email!==undefined)data.email=cleanOptional(d.email)?.toLowerCase()??cleanOptional(d.email);
   if(d.notas!==undefined)data.notas=cleanOptional(d.notas);
   return data;
  });
  if(!Object.keys(changes).length)throw new BadRequestException('No hay campos para modificar');
  await this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.manage');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_UPDATE',d,{id,...d},async()=>{
    await this.editableCustomer(tx,actor.id,id,d.sucursalId);
    await tx.cliente.update({where:{id},data:changes});
    await this.event(tx,actor,d.sucursalId,'CUSTOMER_UPDATED','Cliente',id,Object.keys(changes));
    return {id};
   });
  });
  return this.detailForMutation(actor,id,d.sucursalId);
 }
 async deactivate(actor:Principal,id:string,d:BranchCommand&{motivo:string}){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.manage');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_DEACTIVATE',d,{id,...d},async()=>{
    const row=await this.editableCustomer(tx,actor.id,id,d.sucursalId);
    if(row.activo){
     await tx.cliente.update({where:{id},data:{activo:false}});
     await this.event(tx,actor,d.sucursalId,'CUSTOMER_DEACTIVATED','Cliente',id);
    }
    return {id,activo:false};
   });
  });
 }
 async addresses(actor:Principal,id:string,branchId:string){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,branchId,'customers.read');
   await this.branch(tx,branchId);
   await this.visibleCustomer(tx,actor.id,id,branchId);
   const rows=await tx.direccionCliente.findMany({where:{clienteId:id,activa:true},
    orderBy:[{principal:'desc'},{id:'asc'}]});
   return {data:rows.map(row=>({...row,latitud:row.latitud?.toFixed(7)??null,
    longitud:row.longitud?.toFixed(7)??null}))};
  });
 }
 async addAddress(actor:Principal,id:string,d:AddressCreate){
  const data=this.addressData(d);
  const result=await this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.manage');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_ADDRESS_CREATE',d,{id,...d},async()=>{
    const customer=await this.editableCustomer(tx,actor.id,id,d.sucursalId);
    if(!customer.activo)throw new ConflictException('Cliente inactivo');
    const exists=await tx.direccionCliente.count({where:{clienteId:id,activa:true,principal:true}});
    const primary=d.principal===true||(!exists&&d.principal!==false);
    if(primary)await tx.direccionCliente.updateMany({where:{clienteId:id,activa:true,principal:true},
      data:{principal:false}});
    const address=await tx.direccionCliente.create({data:{clienteId:id,...data,direccion:d.direccion.trim(),principal:primary}});
    await this.event(tx,actor,d.sucursalId,'CUSTOMER_ADDRESS_CREATED','DireccionCliente',address.id);
    return {id:address.id};
   });
  });
  return this.addressForWrite(actor,id,result.id,d.sucursalId);
 }
 private async addressForWrite(actor:Principal,customerId:string,addressId:string,branch:string){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,branch,'customers.manage');
   await this.visibleCustomer(tx,actor.id,customerId,branch);
   const row=await tx.direccionCliente.findFirst({where:{id:addressId,clienteId:customerId}});
   if(!row)throw new NotFoundException('Dirección inexistente');
   return {...row,latitud:row.latitud?.toFixed(7)??null,longitud:row.longitud?.toFixed(7)??null};
  });
 }
 async updateAddress(actor:Principal,id:string,addressId:string,d:AddressUpdate){
  const changes=this.addressData(d);
  if(!Object.keys(changes).length)throw new BadRequestException('No hay campos para modificar');
  await this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.manage');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_ADDRESS_UPDATE',d,{id,addressId,...d},async()=>{
    const customer=await this.editableCustomer(tx,actor.id,id,d.sucursalId);
    if(!customer.activo)throw new ConflictException('Cliente inactivo');
    await this.address(tx,id,addressId);
    await tx.direccionCliente.update({where:{id:addressId},data:changes});
    await this.event(tx,actor,d.sucursalId,'CUSTOMER_ADDRESS_UPDATED','DireccionCliente',
     addressId,Object.keys(changes));
    return {id:addressId};
   });
  });
  return this.addressForWrite(actor,id,addressId,d.sucursalId);
 }
 async setPrimary(actor:Principal,id:string,addressId:string,d:BranchCommand){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.manage');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_ADDRESS_PRIMARY',d,{id,addressId,...d},async()=>{
    const customer=await this.editableCustomer(tx,actor.id,id,d.sucursalId);
    if(!customer.activo)throw new ConflictException('Cliente inactivo');
    await this.address(tx,id,addressId);
    await tx.direccionCliente.updateMany({where:{clienteId:id,activa:true,principal:true},
      data:{principal:false}});
    await tx.direccionCliente.update({where:{id:addressId},data:{principal:true}});
    await this.event(tx,actor,d.sucursalId,'CUSTOMER_ADDRESS_PRIMARY_SET','DireccionCliente',addressId);
    return {id:addressId};
   });
  });
 }
 async deactivateAddress(actor:Principal,id:string,addressId:string,d:BranchCommand){
  return this.atomic(async tx=>{
   await this.require(tx,actor.id,d.sucursalId,'customers.manage');
   await this.branch(tx,d.sucursalId);
   return this.once(tx,actor,'CUSTOMER_ADDRESS_DEACTIVATE',d,{id,addressId,...d},async()=>{
    await this.editableCustomer(tx,actor.id,id,d.sucursalId);
    const row=await tx.direccionCliente.findFirst({where:{id:addressId,clienteId:id}});
    if(!row)throw new NotFoundException('Dirección inexistente');
    if(row.activa){
     await tx.direccionCliente.update({where:{id:addressId},data:{activa:false,principal:false}});
     await this.event(tx,actor,d.sucursalId,'CUSTOMER_ADDRESS_DEACTIVATED','DireccionCliente',addressId);
    }
    return {id:addressId,activa:false};
   });
  });
 }
}
