import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {decimal,distinct,qty} from '../../domain/order.policy.js';
import {audit,outbox,runOnce,ticketInclude,type Tx} from './order-shared.js';
import {ConsumptionStore} from './consumption.store.js';
import type {RouteDto,StartLineDto,StationDto,StationUpdateDto,TicketListDto} from '../../presentation/http/dto/orders.dto.js';
type Perm='orders.create'|'orders.manage';
@Injectable()
export class KitchenStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine,
  private readonly consumption:ConsumptionStore){}
 async stations(u:Principal,branch:string){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'kitchen.read',branch);
   return tx.estacionPreparacion.findMany({where:{sucursalId:branch},include:{
    ubicacionConsumo:{select:{id:true,nombre:true,codigo:true}}},orderBy:{nombre:'asc'}});
  });
 }
 async createStation(u:Principal,d:StationDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'kitchen.manage',d.sucursalId);
   if(d.ubicacionConsumoId){
    const loc=await this.engine.location(tx,d.ubicacionConsumoId);
    if(loc.almacen.sucursalId!==d.sucursalId)throw new ConflictException('Ubicación de otra sucursal');
   }
   const row=await tx.estacionPreparacion.create({data:{
    sucursalId:d.sucursalId,nombre:d.nombre.trim(),ubicacionConsumoId:d.ubicacionConsumoId}});
   await audit(tx,u,'KITCHEN_STATION_CREATED','EstacionPreparacion',row.id,d.sucursalId);
   return row;
  });
 }
 async updateStation(u:Principal,id:string,d:StationUpdateDto){
  return this.engine.tx(async tx=>{
   const old=await tx.estacionPreparacion.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Estación inexistente');
   await this.engine.allowed(tx,u.id,'kitchen.manage',old.sucursalId);
   if(d.ubicacionConsumoId){
    const loc=await this.engine.location(tx,d.ubicacionConsumoId);
    if(loc.almacen.sucursalId!==old.sucursalId)throw new ConflictException('Ubicación de otra sucursal');
   }
   if(d.activa===false){
    const pending=await tx.comanda.count({where:{estacionId:id,
     estado:{in:['PENDIENTE','PREPARANDO']}}});
    if(pending)throw new ConflictException('Estación con comandas pendientes');
   }
   const updated=await tx.estacionPreparacion.update({where:{id},data:{
    ...(d.nombre!==undefined?{nombre:d.nombre.trim()}:{}),
    ...(d.activa!==undefined?{activa:d.activa}:{}),
    ...(d.ubicacionConsumoId!==undefined?{ubicacionConsumoId:d.ubicacionConsumoId}:{})
   }});
   await audit(tx,u,'KITCHEN_STATION_UPDATED','EstacionPreparacion',id,old.sucursalId);
   return updated;
  });
 }
 async routes(u:Principal,branch:string){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'kitchen.read',branch);
   return tx.rutaPreparacion.findMany({where:{estacion:{sucursalId:branch}},
    include:{estacion:{select:{id:true,nombre:true,activa:true}},categoria:true,variante:true},
    orderBy:[{prioridad:'desc'},{id:'asc'}]});
  });
 }
 async route(u:Principal,d:RouteDto){
  return this.engine.tx(async tx=>{
   const station=await tx.estacionPreparacion.findUnique({where:{id:d.estacionId}});
   if(!station?.activa)throw new NotFoundException('Estación inexistente o inactiva');
   await this.engine.allowed(tx,u.id,'kitchen.manage',station.sucursalId);
   if(Boolean(d.varianteId)===Boolean(d.categoriaId))
    throw new ConflictException('Ruta requiere varianteId o categoriaId, exclusivamente');
   if(d.varianteId){
    const variant=await tx.varianteProducto.findUnique({where:{id:d.varianteId},include:{producto:true}});
    if(!variant||variant.producto.tipo!=='PREPARADO')
     throw new ConflictException('La ruta de variante debe ser para PREPARADO');
   }else if(!await tx.categoria.findUnique({where:{id:d.categoriaId!}}))
    throw new NotFoundException('Categoría inexistente');
   const duplicate=await tx.rutaPreparacion.findFirst({where:{
    estacion:{sucursalId:station.sucursalId},
    ...(d.varianteId?{varianteId:d.varianteId}:{categoriaId:d.categoriaId})
   }});
   if(duplicate)throw new ConflictException('Ya existe ruta para ese destino en la sucursal');
   const row=await tx.rutaPreparacion.create({data:{
    estacionId:d.estacionId,varianteId:d.varianteId,categoriaId:d.categoriaId,
    prioridad:d.prioridad??0
   }});
   await audit(tx,u,'KITCHEN_ROUTE_CREATED','RutaPreparacion',row.id,station.sucursalId);
   return row;
  });
 }
 private async choose(tx:Tx,branch:string,varianteId:string,categoriaId:string|null){
  const routes=await tx.rutaPreparacion.findMany({where:{
   estacion:{sucursalId:branch,activa:true},
   OR:[{varianteId},...(categoriaId?[{categoriaId}]:[])]
  },include:{estacion:true}});
  routes.sort((a,b)=>Number(b.varianteId!==null)-Number(a.varianteId!==null)||
   b.prioridad-a.prioridad||a.id.localeCompare(b.id));
  if(routes.length){
   const selected=routes[0].estacion;
   if(!selected.ubicacionConsumoId)throw new ConflictException('Configure ubicación de consumo de estación '+selected.nombre);
   await this.engine.location(tx,selected.ubicacionConsumoId);
   return selected;
  }
  const available=await tx.estacionPreparacion.findMany({where:{sucursalId:branch,activa:true}});
  if(available.length===1&&available[0].ubicacionConsumoId){
   await this.engine.location(tx,available[0].ubicacionConsumoId);
   return available[0];
  }
  throw new ConflictException('Falta configurar la ruta de cocina o ubicación de consumo');
 }
 async sendTx(tx:Tx,u:Principal,orderId:string,permission:Perm){
  const order=await tx.orden.findUnique({where:{id:orderId},include:{
   ordenLineasComoOrden:{include:{variante:{include:{producto:true}}}},
   cuentasComoOrden:true
  }});
  if(!order)throw new NotFoundException('Orden inexistente');
  await this.engine.allowed(tx,u.id,permission,order.sucursalId);
  if(order.estado!=='ABIERTA')throw new ConflictException('No se envían órdenes cerradas o canceladas');
  const pending=order.ordenLineasComoOrden.filter(x=>!x.canceladaEn&&x.cantidad.gt(x.cantidadEnviada));
  if(!pending.length)return [];
  const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:order.sucursalId}});
  if(config?.exigeCobroAntesPreparar&&
   order.cuentasComoOrden.reduce((s,c)=>s.plus(c.pagado),new Prisma.Decimal(0)).lt(order.total))
   throw new ConflictException('Sucursal exige cobro confirmado antes de enviar a preparar');
  const byStation=new Map<string,{id:string;name:string;rows:Array<{id:string;delta:Prisma.Decimal;notas:string|null}>}>();
  for(const line of pending){
   const delta=line.cantidad.minus(line.cantidadEnviada);
   if(line.variante.producto.tipo==='PREPARADO'){
    if(!line.recetaVersionId)throw new ConflictException('Producto sin receta publicada');
    const station=await this.choose(tx,order.sucursalId,line.varianteId,line.variante.producto.categoriaId);
    const group=byStation.get(station.id)??{id:station.id,name:station.nombre,rows:[]};
    group.rows.push({id:line.id,delta,notas:line.notasCocina});
    byStation.set(station.id,group);
   }else if(line.variante.producto.tipo==='INVENTARIABLE'){
    const articleId=line.variante.articuloInventarioId;
    if(!articleId)throw new ConflictException('Producto inventariable sin artículo asociado');
    const article=await tx.articuloInventario.findUnique({where:{id:articleId,activo:true},
     include:{unidadBase:true}});
    if(!article||article.unidadBase.dimension!=='UNIDAD')
     throw new ConflictException('Venta directa requiere artículo activo con unidad base UNIDAD');
    await this.consumption.direct(tx,u,order.id,line.id,articleId,order.sucursalId,delta,permission);
   }
   await tx.ordenLinea.update({where:{id:line.id},data:{cantidadEnviada:line.cantidad}});
  }
  const tickets:string[]=[];
  for(const station of byStation.values()){
   const ticket=await tx.comanda.create({data:{
    numero:'CO-'+randomUUID().slice(0,12),ordenId:order.id,estacionId:station.id,
    comandaLineasComoComanda:{create:station.rows.map(row=>({
     ordenLineaId:row.id,cantidad:row.delta,notasSnapshot:row.notas
    }))}
   }});
   tickets.push(ticket.id);
   await tx.eventoComanda.create({data:{comandaId:ticket.id,usuarioId:u.id,accion:'ENVIADA'}});
   await outbox(tx,'KITCHEN_TICKET_CREATED','Comanda',ticket.id,order.sucursalId,{
    ordenId:order.id,estacionId:station.id});
  }
  await tx.orden.update({where:{id:order.id},data:{version:{increment:1}}});
  await audit(tx,u,'ORDER_SENT','Orden',order.id,order.sucursalId,{
   tickets,articulosEnviados:pending.length});
  await outbox(tx,'ORDER_UPDATED','Orden',order.id,order.sucursalId);
  return tickets;
 }
 async list(u:Principal,q:TicketListDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'kitchen.read',q.sucursalId);
   if(q.estacionId){
    const station=await tx.estacionPreparacion.findUnique({where:{id:q.estacionId}});
    if(!station||station.sucursalId!==q.sucursalId)throw new ConflictException('Estación fuera de sucursal');
   }
   const where:Prisma.ComandaWhereInput={estacion:{sucursalId:q.sucursalId},
    ...(q.estacionId?{estacionId:q.estacionId}:{}),...(q.estado?{estado:q.estado}:{})};
   const [rows,total]=await Promise.all([
    tx.comanda.findMany({where,include:ticketInclude,orderBy:{enviadaEn:'asc'},
     skip:(q.page-1)*q.limit,take:q.limit}),
    tx.comanda.count({where})]);
   return {data:rows,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 private async ticket(tx:Tx,id:string){
  const row=await tx.comanda.findUnique({where:{id},include:{
   estacion:true,orden:{select:{id:true,numero:true,estado:true,modalidad:true,sucursalId:true}},
   comandaLineasComoComanda:{include:{ordenLinea:{include:{
    ordenLineaModificadoresComoOrdenLinea:true}}}}
  }});
  if(!row)throw new NotFoundException('Comanda inexistente');
  if(row.estacion.sucursalId!==row.orden.sucursalId)
   throw new ConflictException('Comanda asignada fuera de sucursal');
  return row;
 }
 async detail(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const row=await this.ticket(tx,id);
   await this.engine.allowed(tx,u.id,'kitchen.read',row.orden.sucursalId);
   return tx.comanda.findUniqueOrThrow({where:{id},include:ticketInclude});
  });
 }
 private async startLineTx(tx:Tx,u:Principal,lineId:string,count?:Prisma.Decimal){
  const row=await tx.comandaLinea.findUnique({where:{id:lineId},include:{
   comanda:{include:{estacion:true,orden:true}},
   ordenLinea:{include:{ordenLineaModificadoresComoOrdenLinea:true}}
  }});
  if(!row)throw new NotFoundException('Línea de comanda inexistente');
  const ticket=row.comanda,order=ticket.orden;
  await this.engine.allowed(tx,u.id,'kitchen.manage',order.sucursalId);
  if(ticket.estado==='CANCELADA'||order.estado!=='ABIERTA'||row.canceladaEn)
   throw new ConflictException('Comanda o línea cancelada');
  if(row.listaEn)throw new ConflictException('La línea ya está lista');
  const remaining=row.cantidad.minus(row.cantidadPreparada);
  if(!remaining.gt(0))return ticket.id;
  const amount=count??remaining;
  if(!amount.gt(0)||amount.gt(remaining))
   throw new ConflictException('Cantidad solicitada excede pendiente de preparación');
  if(!ticket.estacion.ubicacionConsumoId)
   throw new ConflictException('Estación sin ubicación de consumo');
  const modifiers=row.ordenLinea.ordenLineaModificadoresComoOrdenLinea.flatMap(x=>
   Array.from({length:x.cantidad},()=>x.modificadorId));
  await this.consumption.recipe(tx,u,order.id,row.ordenLineaId,row.id,
   row.ordenLinea.recetaVersionId!,amount,ticket.estacion.ubicacionConsumoId,
   modifiers,order.modalidad,row.cantidadPreparada,row.ordenLinea.composicionSnapshot);
  await this.consumption.packaging(tx,u,order.id,order.sucursalId,order.modalidad);
  await tx.comandaLinea.update({where:{id:lineId},data:{
   cantidadPreparada:row.cantidadPreparada.plus(amount)}});
  if(ticket.estado==='PENDIENTE')await tx.comanda.update({where:{id:ticket.id},data:{
   estado:'PREPARANDO',iniciadaEn:new Date()
  }});
  await tx.eventoComanda.create({data:{
   comandaId:ticket.id,usuarioId:u.id,accion:'PREPARACION_INICIADA',
   nota:qty(amount)+' unidades en línea '+lineId
  }});
  await outbox(tx,'KITCHEN_TICKET_UPDATED','Comanda',ticket.id,order.sucursalId,{
   lineaId:lineId,estado:'PREPARANDO'});
  return ticket.id;
 }
 private async startTx(tx:Tx,u:Principal,id:string){
  const ticket=await this.ticket(tx,id);
  await this.engine.allowed(tx,u.id,'kitchen.manage',ticket.orden.sucursalId);
  if(ticket.estado==='CANCELADA'||ticket.orden.estado!=='ABIERTA')
   throw new ConflictException('Comanda no disponible');
  if(ticket.estado==='LISTA')return ticket.id;
  for(const line of ticket.comandaLineasComoComanda){
   if(line.canceladaEn||line.listaEn)continue;
   const rest=line.cantidad.minus(line.cantidadPreparada);
   if(rest.gt(0))await this.startLineTx(tx,u,line.id,rest);
  }
  return ticket.id;
 }
 async start(u:Principal,id:string){
  const result=await this.engine.tx(tx=>this.startTx(tx,u,id));
  return this.detail(u,result);
 }
 async startLine(u:Principal,id:string,d:StartLineDto){
  const result=await this.engine.tx(tx=>runOnce(tx,u,d.claveOperacion,'KITCHEN_LINE_START',
   {id,cantidad:d.cantidad??null},async()=>{
    const ticketId=await this.startLineTx(tx,u,id,d.cantidad?decimal(d.cantidad):undefined);
    return {ticketId};
   }));
  return this.detail(u,result.ticketId);
 }
 private async readyLineTx(tx:Tx,u:Principal,id:string){
  const row=await tx.comandaLinea.findUnique({where:{id},include:{
   comanda:{include:{orden:true}},ordenLinea:true
  }});
  if(!row)throw new NotFoundException('Línea de comanda inexistente');
  await this.engine.allowed(tx,u.id,'kitchen.manage',row.comanda.orden.sucursalId);
  if(row.canceladaEn||row.comanda.estado==='CANCELADA')
   throw new ConflictException('Comanda cancelada');
  if(row.listaEn)return row.comandaId;
  if(row.cantidadPreparada.lt(row.cantidad))
   await this.startLineTx(tx,u,id,row.cantidad.minus(row.cantidadPreparada));
  await tx.comandaLinea.update({where:{id},data:{listaEn:new Date()}});
  await tx.eventoComanda.create({data:{comandaId:row.comandaId,usuarioId:u.id,
   accion:'LINEA_LISTA',nota:id}});
  const still=await tx.comandaLinea.count({where:{comandaId:row.comandaId,
   canceladaEn:null,listaEn:null}});
  if(!still){
   await tx.comanda.update({where:{id:row.comandaId},data:{estado:'LISTA',listaEn:new Date()}});
  }
  await outbox(tx,'KITCHEN_TICKET_UPDATED','Comanda',row.comandaId,row.comanda.orden.sucursalId,{
   lineaId:id,estado:still?'PREPARANDO':'LISTA'});
  return row.comandaId;
 }
 async readyLine(u:Principal,id:string){
  const ticket=await this.engine.tx(tx=>this.readyLineTx(tx,u,id));
  return this.detail(u,ticket);
 }
 async ready(u:Principal,id:string){
  const ticket=await this.engine.tx(async tx=>{
   const row=await this.ticket(tx,id);
   if(row.estado==='CANCELADA')throw new ConflictException('Comanda cancelada');
   await this.engine.allowed(tx,u.id,'kitchen.manage',row.orden.sucursalId);
   await this.startTx(tx,u,id);
   for(const line of row.comandaLineasComoComanda)
    if(!line.canceladaEn&&!line.listaEn)await this.readyLineTx(tx,u,line.id);
   return id;
  });
  return this.detail(u,ticket);
 }
 async deliver(u:Principal,id:string){
  const ticket=await this.engine.tx(async tx=>{
   const row=await tx.comandaLinea.findUnique({where:{id},
    include:{comanda:{include:{orden:true}}}});
   if(!row)throw new NotFoundException('Línea inexistente');
   await this.engine.allowed(tx,u.id,'kitchen.manage',row.comanda.orden.sucursalId);
   if(!row.listaEn||row.canceladaEn)throw new ConflictException('Línea aún no está lista');
   if(!row.entregadaEn)await tx.comandaLinea.update({where:{id},data:{entregadaEn:new Date()}});
   await tx.eventoComanda.create({data:{comandaId:row.comandaId,usuarioId:u.id,
    accion:'LINEA_ENTREGADA',nota:id}});
   await outbox(tx,'KITCHEN_TICKET_UPDATED','Comanda',row.comandaId,row.comanda.orden.sucursalId,{
    lineaId:id,entregada:true});
   return row.comandaId;
  });
  return this.detail(u,ticket);
 }
}
