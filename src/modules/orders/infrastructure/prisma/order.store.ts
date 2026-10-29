import {randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {variantPrice,modifierPrice} from '../../../catalog/infrastructure/prisma/catalog-prisma.shared.js';
import {decimal,distinct,price,qty,requireNote,sha} from '../../domain/order.policy.js';
import {audit,outbox,runOnce,orderInclude,type Tx} from './order-shared.js';
import {TableStore} from './table.store.js';
import {PaymentsStore} from '../../../payments/infrastructure/prisma/payments.store.js';
import {KitchenStore} from './kitchen.store.js';
import {CustomerSelectionPort} from '../../../customers/application/ports/customers.port.js';
import type {CreateOrderDto,AddItemsDto,OrderItemDto,EditLineDto,EditOrderDto,OrderListDto,ReasonDto,CancelOrderDto,SendDto} from '../../presentation/http/dto/orders.dto.js';
import {requiresCancellationAuthorization,requireCancellationClassification} from '../../domain/cancellation.policy.js';
export type IngredientModifierSnapshot={modificadorId:string;articuloId:string;
 unidadId:string;cantidad:string;efecto:'SUMAR'|'RESTAR'|'SUSTITUIR';
 sustituyeArticuloId:string|null};
type ModifierSnapshot={id:string;nombre:string;unit:Prisma.Decimal};
type QuotedLine={varianteId:string;nombre:string;cantidad:Prisma.Decimal;unit:Prisma.Decimal;
 total:Prisma.Decimal;discount:Prisma.Decimal;recetaVersionId:string|null;
 modifiers:ModifierSnapshot[];composition:IngredientModifierSnapshot[];notas:string|null};
@Injectable()
export class OrderStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine,
  private readonly identity:IdentityRepository,private readonly tables:TableStore,
  private readonly kitchen:KitchenStore,private readonly payments:PaymentsStore,
  private readonly customerSelection:CustomerSelectionPort){}
 private async visible(u:Principal,branch:string){
  const caps=await this.identity.capabilities(u.id,branch);
  if(!['orders.read','orders.create','orders.manage'].some(x=>caps.includes(x)))
   throw new ForbiddenException('Permiso insuficiente para consultar orden');
 }
 private async order(tx:Tx,id:string){
  const order=await tx.orden.findUnique({where:{id}});
  if(!order)throw new NotFoundException('Orden inexistente');
  return order;
 }
 private async quote(tx:Tx,u:Principal,branch:string,item:OrderItemDto):Promise<QuotedLine>{
  const count=decimal(item.cantidad);
  const now=new Date();
  const variant=await tx.varianteProducto.findUnique({where:{id:item.varianteId},
   include:{producto:true}});
  if(!variant||!variant.activo||!variant.producto.activo)
   throw new ConflictException('Variante o producto inactivo');
  const over=await tx.varianteSucursal.findUnique({where:{
   varianteId_sucursalId:{varianteId:variant.id,sucursalId:branch}}});
  if(over&&(!over.habilitada||over.pausadaHasta&&over.pausadaHasta>now))
   throw new ConflictException('Variante no habilitada en sucursal');
  const base=await variantPrice(tx,variant.id,branch,now);
  if(!base)throw new ConflictException('Variante sin precio vigente en sucursal');
  const chosen=(item.modificadores??[]).map(x=>x.modificadorId);
  if(chosen.length>30)throw new BadRequestException('Demasiados modificadores');
  distinct(chosen,x=>x,'Modificador');
  const [linked,mods]=await Promise.all([
   tx.varianteGrupoModificador.findMany({where:{varianteId:variant.id},include:{grupo:true}}),
   tx.modificador.findMany({where:{id:{in:chosen}},include:{grupo:true}})
  ]);
  if(mods.length!==chosen.length||mods.some(x=>!x.activo||!x.grupo.activo))
   throw new ConflictException('Modificador inexistente o inactivo');
  const counts=new Map<string,number>();
  const linkIds=new Set(linked.map(x=>x.grupoId));
  for(const m of mods){
   if(!linkIds.has(m.grupoId))throw new ConflictException('Modificador no permitido');
   counts.set(m.grupoId,(counts.get(m.grupoId)??0)+1);
  }
  for(const g of linked){
   const selected=counts.get(g.grupoId)??0;
   if(selected<Math.max(g.obligatorio?1:0,g.grupo.minimo)||
    g.grupo.maximo!==null&&selected>g.grupo.maximo)
    throw new ConflictException('Selección inválida en grupo '+g.grupo.nombre);
  }
  const compositions=chosen.length?await tx.modificadorComponente.findMany({
   where:{modificadorId:{in:chosen}},select:{modificadorId:true,articuloId:true,
    unidadId:true,cantidad:true,efecto:true,sustituyeArticuloId:true}}):[];
  const physical=new Set(compositions.map(x=>x.modificadorId));
  const missing=mods.filter(x=>x.requiereComposicion&&!physical.has(x.id));
  if(missing.length)throw new ConflictException('Modificador requiere ingredientes configurados: '+missing.map(x=>x.nombre).join(', '));
  const snapshot:IngredientModifierSnapshot[]=compositions.map(x=>({
   modificadorId:x.modificadorId,articuloId:x.articuloId,unidadId:x.unidadId,
   cantidad:x.cantidad.toFixed(6),efecto:x.efecto,
   sustituyeArticuloId:x.sustituyeArticuloId
  }));
  const prices=await Promise.all(mods.map(async m=>({
   id:m.id,nombre:m.nombre,unit:await modifierPrice(tx,m.id,branch,now)
  })));
  const unit=new Prisma.Decimal(base.importe);
  const total=count.mul(prices.reduce((sum,x)=>sum.plus(x.unit),unit))
   .toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
  const discount=new Prisma.Decimal(item.descuento??0);
  if(discount.lt(0)||discount.gt(total))throw new BadRequestException('Descuento excede importe de línea');
  if(discount.gt(0))await this.engine.allowed(tx,u.id,'orders.discount',branch);
  let recipeId:string|null=null;
  if(variant.producto.tipo==='PREPARADO'){
   const recipe=await tx.receta.findFirst({where:{
    varianteId:variant.id,tipo:'VENTA',activa:true
   },include:{recetaVersionesComoReceta:{
    where:{activa:true,publicadaEn:{not:null}},take:1}}});
   recipeId=recipe?.recetaVersionesComoReceta[0]?.id??null;
   if(!recipeId)throw new ConflictException('Variante preparada sin receta publicada');
  }else if(variant.producto.tipo==='INVENTARIABLE'&&!variant.articuloInventarioId)
   throw new ConflictException('Variante inventariable sin artículo asociado');
  return {varianteId:variant.id,nombre:variant.producto.nombre+
   (variant.nombre? ' — '+variant.nombre:''),cantidad:count,unit,total,
   discount,recetaVersionId:recipeId,modifiers:prices,composition:snapshot,
   notas:item.notasCocina?.trim()??null};
 }
 private async insertLine(tx:Tx,orderId:string,q:QuotedLine){
  const line=await tx.ordenLinea.create({data:{
   ordenId:orderId,varianteId:q.varianteId,nombreSnapshot:q.nombre,
   cantidad:q.cantidad,precioUnitario:q.unit,subtotal:q.total,descuento:q.discount,
   recetaVersionId:q.recetaVersionId,
   composicionSnapshot:q.composition as unknown as Prisma.InputJsonValue,
   notasCocina:q.notas,
   ...(q.modifiers.length?{ordenLineaModificadoresComoOrdenLinea:{
    create:q.modifiers.map(m=>({modificadorId:m.id,nombreSnapshot:m.nombre,
     cantidad:1,recargoUnitario:m.unit}))}}:{})
  }});
  return line;
 }
 private async recalc(tx:Tx,id:string){
  const lines=await tx.ordenLinea.findMany({where:{ordenId:id}});
  const active=lines.filter(x=>!x.canceladaEn);
  const subtotal=active.reduce((sum,x)=>sum.plus(x.subtotal),new Prisma.Decimal(0));
  const discount=active.reduce((sum,x)=>sum.plus(x.descuento),new Prisma.Decimal(0));
  const total=subtotal.minus(discount);
  const accounts=await tx.cuenta.findMany({where:{ordenId:id}});
  if(accounts.length!==1||accounts[0].estado!=='ABIERTA')
   throw new ConflictException('Reasignación/división de cuentas se gestiona en Pagos/Caja');
  const account=accounts[0];
  if(account.pagado.greaterThan(total))throw new ConflictException('El total sería inferior al importe ya pagado');
  for(const l of lines){
   await tx.cuentaLinea.upsert({where:{cuentaId_ordenLineaId:{
    cuentaId:account.id,ordenLineaId:l.id}},create:{
    cuentaId:account.id,ordenLineaId:l.id,
    cantidadAsignada:l.canceladaEn?new Prisma.Decimal(0):l.cantidad,
    importeAsignado:l.canceladaEn?new Prisma.Decimal(0):l.subtotal.minus(l.descuento)
   },update:{
    cantidadAsignada:l.canceladaEn?new Prisma.Decimal(0):l.cantidad,
    importeAsignado:l.canceladaEn?new Prisma.Decimal(0):l.subtotal.minus(l.descuento)
   }});
  }
  await tx.cuenta.update({where:{id:account.id},data:{total}});
  return tx.orden.update({where:{id},data:{
   subtotal,descuentoTotal:discount,total,version:{increment:1}
  }});
 }
 async detail(u:Principal,id:string){
  const check=await this.db.orden.findUnique({where:{id},select:{sucursalId:true}});
  if(!check)throw new NotFoundException('Orden inexistente');
  await this.visible(u,check.sucursalId);
  return this.db.orden.findUniqueOrThrow({where:{id},include:orderInclude});
 }
 async list(u:Principal,q:OrderListDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'orders.read',q.sucursalId);
   const where:Prisma.OrdenWhereInput={sucursalId:q.sucursalId,
    ...(q.estado?{estado:q.estado}:{}),...(q.modalidad?{modalidad:q.modalidad}:{}),
    ...(q.search?{numero:{contains:q.search,mode:'insensitive'}}:{})};
   const [data,total]=await Promise.all([
    tx.orden.findMany({where,select:{id:true,numero:true,modalidad:true,origen:true,
     estado:true,version:true,total:true,abiertaEn:true,ocupacionMesaId:true},
     orderBy:{abiertaEn:'desc'},skip:(q.page-1)*q.limit,take:q.limit}),
    tx.orden.count({where})]);
   return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async create(u:Principal,d:CreateOrderDto){
  const result=await this.engine.tx(tx=>runOnce(tx,u,d.claveOperacion,'ORDER_CREATE',d,async()=>{
   await this.engine.allowed(tx,u.id,'orders.create',d.sucursalId);
   const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!branch?.activa)throw new ConflictException('Sucursal inexistente o inactiva');
   if(d.modalidad==='MESA'&&!d.mesaId)throw new BadRequestException('Servicio MESA requiere mesaId');
   if(d.modalidad!=='MESA'&&d.mesaId)throw new BadRequestException('mesaId solo en modalidad MESA');
   if(d.clienteId)await this.customerSelection.assertSelectableInTx(tx,u.id,d.sucursalId,d.clienteId);
   const occupant=d.mesaId?await this.tables.findOrOpen(tx,u,d.mesaId,d.sucursalId):null;
   const order=await tx.orden.create({data:{
    sucursalId:d.sucursalId,numero:'ORD-'+randomUUID().slice(0,12),
    modalidad:d.modalidad,origen:d.origen??'CAJA',usuarioId:u.id,
    ocupacionMesaId:occupant?.id,clienteId:d.clienteId,observaciones:d.observaciones,
    claveOperacion:d.claveOperacion,solicitudHash:sha({actor:u.id,request:d})
   }});
   await tx.cuenta.create({data:{ordenId:order.id,nombre:'Cuenta principal'}});
   for(const item of d.lineas)await this.insertLine(tx,order.id,await this.quote(tx,u,d.sucursalId,item));
   await this.recalc(tx,order.id);
   const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:d.sucursalId}});
   if((d.enviarCocina??true)&&!config?.exigeCobroAntesPreparar)
    await this.kitchen.sendTx(tx,u,order.id,'orders.create');
   await audit(tx,u,'ORDER_CREATED','Orden',order.id,d.sucursalId,{lineas:d.lineas.length});
   await outbox(tx,'ORDER_CREATED','Orden',order.id,d.sucursalId);
   return {orderId:order.id};
  }));
  return this.detail(u,result.orderId);
 }
 async edit(u:Principal,id:string,d:EditOrderDto){
  const result=await this.engine.tx(async tx=>{
   const order=await this.order(tx,id);
   await this.engine.allowed(tx,u.id,'orders.manage',order.sucursalId);
   if(order.estado!=='ABIERTA')throw new ConflictException('Orden no editable');
   if(d.clienteId)await this.customerSelection.assertSelectableInTx(tx,u.id,order.sucursalId,d.clienteId);
   const updated=await tx.orden.updateMany({where:{id,version:d.version,estado:'ABIERTA'},
    data:{version:{increment:1},
     ...(d.observaciones!==undefined?{observaciones:d.observaciones}:{}),
     ...(d.clienteId!==undefined?{clienteId:d.clienteId}:{})}});
   if(updated.count!==1)throw new ConflictException('Orden modificada concurrentemente: actualice los datos');
   await audit(tx,u,'ORDER_UPDATED','Orden',id,order.sucursalId);
   await outbox(tx,'ORDER_UPDATED','Orden',id,order.sucursalId);
   return id;
  });
  return this.detail(u,result);
 }
 async add(u:Principal,id:string,d:AddItemsDto){
  const result=await this.engine.tx(tx=>runOnce(tx,u,d.claveOperacion,'ORDER_LINES_ADD',
   {id,...d},async()=>{
    const order=await this.order(tx,id);
    await this.engine.allowed(tx,u.id,'orders.manage',order.sucursalId);
    if(order.estado!=='ABIERTA')throw new ConflictException('Orden no editable');
    for(const item of d.lineas)await this.insertLine(tx,id,await this.quote(tx,u,order.sucursalId,item));
    await this.recalc(tx,id);
    const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:order.sucursalId}});
    if((d.enviarCocina??true)&&(!config?.exigeCobroAntesPreparar||
      (await tx.cuenta.aggregate({where:{ordenId:id},_sum:{pagado:true}}))._sum.pagado?.gte(
       (await tx.orden.findUniqueOrThrow({where:{id}})).total)))
     await this.kitchen.sendTx(tx,u,id,'orders.manage');
    await audit(tx,u,'ORDER_LINES_ADDED','Orden',id,order.sucursalId,{cantidad:d.lineas.length});
    await outbox(tx,'ORDER_UPDATED','Orden',id,order.sucursalId);
    return {orderId:id};
   }));
  return this.detail(u,result.orderId);
 }
 async editLine(u:Principal,id:string,lineId:string,d:EditLineDto){
  const result=await this.engine.tx(tx=>runOnce(tx,u,d.claveOperacion,'ORDER_LINE_EDIT',
   {id,lineId,...d},async()=>{
    const order=await this.order(tx,id);
    await this.engine.allowed(tx,u.id,'orders.manage',order.sucursalId);
    if(order.estado!=='ABIERTA')throw new ConflictException('Orden cerrada o cancelada');
    const line=await tx.ordenLinea.findFirst({where:{id:lineId,ordenId:id},
     include:{ordenLineaModificadoresComoOrdenLinea:true}});
    if(!line||line.canceladaEn)throw new NotFoundException('Línea inexistente');
    if(line.cantidadEnviada.gt(0))throw new ConflictException('Línea enviada no editable: añada una nueva línea');
    const qtyNew=d.cantidad?decimal(d.cantidad):line.cantidad;
    let snapshot:QuotedLine|null=null;
    if(d.modificadores!==undefined){
     snapshot=await this.quote(tx,u,order.sucursalId,{varianteId:line.varianteId,
      cantidad:qty(qtyNew),modificadores:d.modificadores});
    }
    const modifications=snapshot?.modifiers??line.ordenLineaModificadoresComoOrdenLinea.map(m=>({
     id:m.modificadorId,nombre:m.nombreSnapshot,unit:m.recargoUnitario}));
    if(snapshot){
     await tx.ordenLineaModificador.deleteMany({where:{ordenLineaId:line.id}});
     if(modifications.length)await tx.ordenLineaModificador.createMany({data:
      modifications.map(m=>({ordenLineaId:line.id,modificadorId:m.id,
       nombreSnapshot:m.nombre,cantidad:1,recargoUnitario:m.unit}))});
    }
    const subtotal=qtyNew.mul(modifications.reduce((sum,m)=>sum.plus(m.unit),line.precioUnitario))
     .toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
    const discount=new Prisma.Decimal(d.descuento??line.descuento);
    if(discount.gt(subtotal)||discount.lt(0))
     throw new ConflictException('Descuento supera el importe actualizado');
    if(d.descuento!==undefined&&discount.gt(0))
     await this.engine.allowed(tx,u.id,'orders.discount',order.sucursalId);
    await tx.ordenLinea.update({where:{id:line.id},data:{
     cantidad:qtyNew,subtotal,descuento:discount,
     ...(snapshot?{composicionSnapshot:snapshot.composition as unknown as Prisma.InputJsonValue}:{}),
     ...(d.notasCocina!==undefined?{notasCocina:d.notasCocina}:{})
    }});
    await this.recalc(tx,id);
    await audit(tx,u,'ORDER_LINE_UPDATED','OrdenLinea',lineId,order.sucursalId);
    await outbox(tx,'ORDER_UPDATED','Orden',id,order.sucursalId);
    return {orderId:id};
   }));
  return this.detail(u,result.orderId);
 }
 async cancelLine(u:Principal,id:string,lineId:string,d:ReasonDto){
  const result=await this.engine.tx(async tx=>{
   const order=await this.order(tx,id);
   await this.engine.allowed(tx,u.id,'orders.manage',order.sucursalId);
   if(order.estado!=='ABIERTA')throw new ConflictException('Orden no editable');
   const line=await tx.ordenLinea.findFirst({where:{id:lineId,ordenId:id},
    include:{comandaLineasComoOrdenLinea:true}});
   if(!line)throw new NotFoundException('Línea inexistente');
   if(line.canceladaEn)return id;
   const consumed=await tx.consumoOrden.count({where:{ordenLineaId:line.id}});
   if(consumed)throw new ConflictException('Línea con consumo real: requiere tratamiento de devolución/merma');
   for(const ticket of line.comandaLineasComoOrdenLinea){
    if(ticket.cantidadPreparada.gt(0)||ticket.listaEn)
     throw new ConflictException('Línea preparada no puede cancelarse directamente');
    await tx.comandaLinea.update({where:{id:ticket.id},data:{canceladaEn:new Date()}});
    const remaining=await tx.comandaLinea.count({where:{comandaId:ticket.comandaId,canceladaEn:null}});
    if(!remaining)await tx.comanda.update({where:{id:ticket.comandaId},data:{
     estado:'CANCELADA',canceladaEn:new Date()}});
    await outbox(tx,'KITCHEN_TICKET_UPDATED','Comanda',ticket.comandaId,order.sucursalId);
   }
   await tx.ordenLinea.update({where:{id:lineId},data:{canceladaEn:new Date()}});
   await this.recalc(tx,id);
   await audit(tx,u,'ORDER_LINE_CANCELLED','OrdenLinea',lineId,order.sucursalId,{},requireNote(d.motivo));
   await outbox(tx,'ORDER_UPDATED','Orden',id,order.sucursalId);
   return id;
  });
  return this.detail(u,result);
 }
 async send(u:Principal,id:string,d:SendDto){
  const result=await this.engine.tx(tx=>runOnce(tx,u,d.claveOperacion,'ORDER_SEND',
   {orderId:id},async()=>{
    await this.kitchen.sendTx(tx,u,id,'orders.manage');
    return {orderId:id};
   }));
  return this.detail(u,result.orderId);
 }
 async cancel(u:Principal,id:string,d:CancelOrderDto){
  const result=await this.engine.tx(async tx=>{
   const order=await this.order(tx,id);
   await this.engine.allowed(tx,u.id,'orders.manage',order.sucursalId);
   if(order.estado==='CANCELADA')return id;
   if(order.estado!=='ABIERTA')throw new ConflictException('Orden ya cerrada');
   const accounts=await tx.cuenta.findMany({where:{ordenId:id}});
   if(accounts.some(c=>c.pagado.gt(0)))
    throw new ConflictException('Orden con pagos: resolver reembolso en Pagos/Caja');
   const [consumed,prepared,delivered]=await Promise.all([
    tx.consumoOrden.count({where:{ordenId:id}}),
    tx.comandaLinea.count({where:{comanda:{ordenId:id},cantidadPreparada:{gt:0}}}),
    tx.comandaLinea.count({where:{comanda:{ordenId:id},entregadaEn:{not:null}}})
   ]);
   const protectedCancel=requiresCancellationAuthorization({consumed,prepared,delivered});
   if(protectedCancel){
    requireCancellationClassification(d.clasificacion);
    await this.engine.allowed(tx,u.id,'orders.cancel.prepared',order.sucursalId);
   }
   const now=new Date();
   await tx.orden.update({where:{id},data:{estado:'CANCELADA',
    importeAnulado:order.total,clasificacionCancelacion:d.clasificacion??null,
    motivoCancelacion:requireNote(d.motivo),autorizadaCancelacionPreparada:protectedCancel,
    canceladaEn:now,version:{increment:1}}});
   for(const account of accounts){
    await tx.intentoPago.updateMany({where:{cuentaId:account.id,estado:'PENDIENTE'},
     data:{estado:'CANCELADO'}});
    await tx.cuentaLinea.updateMany({where:{cuentaId:account.id},data:{
     cantidadAsignada:new Prisma.Decimal(0),importeAsignado:new Prisma.Decimal(0)}});
    await tx.cuenta.update({where:{id:account.id},data:{
     total:new Prisma.Decimal(0),estado:'CERRADA',cerradaEn:now}});
   }
   const tickets=await tx.comanda.findMany({where:{ordenId:id,estado:{in:['PENDIENTE','PREPARANDO']}}});
   for(const t of tickets){
    await tx.comanda.update({where:{id:t.id},data:{estado:'CANCELADA',canceladaEn:new Date()}});
    await tx.comandaLinea.updateMany({where:{comandaId:t.id,listaEn:null},
     data:{canceladaEn:new Date()}});
    await tx.eventoComanda.create({data:{comandaId:t.id,usuarioId:u.id,accion:'CANCELADA',nota:d.motivo}});
    await outbox(tx,'KITCHEN_TICKET_UPDATED','Comanda',t.id,order.sucursalId);
   }
   await audit(tx,u,'ORDER_CANCELLED','Orden',id,order.sucursalId,
    {consumosExistentes:consumed,preparadas:prepared,entregadas:delivered,
     importeAnulado:order.total.toFixed(2),clasificacion:d.clasificacion??null,
     autorizacionSupervisor:protectedCancel,noRevertirInventario:true},requireNote(d.motivo));
   await outbox(tx,'ORDER_CANCELLED','Orden',id,order.sucursalId);
   if(order.ocupacionMesaId){
    const active=await tx.orden.count({where:{ocupacionMesaId:order.ocupacionMesaId,estado:'ABIERTA'}});
    if(!active){
     await tx.ocupacionMesa.updateMany({where:{id:order.ocupacionMesaId,cerradaEn:null},
      data:{cerradaEn:now}});
     await outbox(tx,'TABLE_RELEASED','OcupacionMesa',order.ocupacionMesaId,order.sucursalId);
    }
   }
   return id;
  });
  return this.detail(u,result);
 }

 async close(u:Principal,id:string){
  await this.payments.settle(u,id);
  return this.detail(u,id);
 }

}
