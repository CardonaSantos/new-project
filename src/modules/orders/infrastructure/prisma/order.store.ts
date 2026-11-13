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
import {DeliveryStore} from '../../../delivery/infrastructure/prisma/delivery.store.js';
import type {CollectDto} from '../../../payments/presentation/http/dto/payments.dto.js';
import type {QuoteOrderDto,CreateOrderDto,QuickCheckoutDto,AddItemsDto,OrderItemDto,EditLineDto,EditOrderDto,OrderListDto,ReasonDto,CancelOrderDto,SendDto} from '../../presentation/http/dto/orders.dto.js';
import {requiresCancellationAuthorization,requireCancellationClassification} from '../../domain/cancellation.policy.js';
import {renderReceipt,modeLabel,qtyText,receiptInstant,receiptModifiers,
 type ReceiptField,type ReceiptLine} from '../../application/order-receipt-pdf.js';
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
  private readonly customerSelection:CustomerSelectionPort,private readonly delivery:DeliveryStore){}
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
 /** Mirrors orders-order-print-page.ts's HTML receipt, as an actual PDF file (window.print()
  * on that page never produces one) — the WhatsApp-share button on the frontend fetches this
  * and hands it to navigator.share(). detail() above already enforces visibility; reused as-is. */
 async receiptPdf(u:Principal,id:string):Promise<{buffer:Buffer;filename:string}>{
  const order=await this.detail(u,id);
  const branch=await this.db.sucursal.findUnique({where:{id:order.sucursalId},
   select:{zonaHoraria:true}});
  const tz=branch?.zonaHoraria??'America/Guatemala';
  const fields:ReceiptField[]=[{label:'Atención',value:modeLabel(order.modalidad),strong:true}];
  if(order.ocupacionMesa?.mesa?.numero){
   fields.push({label:'Mesa',value:order.ocupacionMesa.mesa.numero,strong:true});
   if(order.ocupacionMesa.mesa.sala?.nombre)
    fields.push({label:'Sala',value:order.ocupacionMesa.mesa.sala.nombre});
  }
  if(order.cliente){
   fields.push({label:'Cliente',value:order.cliente.nombre,strong:true});
   if(order.cliente.telefono)fields.push({label:'Teléfono',value:order.cliente.telefono});
  }
  fields.push({label:'Registrado',value:receiptInstant(order.abiertaEn,tz)});
  fields.push({label:'Estado',value:order.estado,strong:true});
  const lines:ReceiptLine[]=order.ordenLineasComoOrden.filter(l=>!l.canceladaEn).map(l=>({
   qty:qtyText(l.cantidad),nombre:l.nombreSnapshot,
   modificadores:receiptModifiers(l.ordenLineaModificadoresComoOrdenLinea),
   nota:l.notasCocina||null}));
  // Customer-facing document: a warm close and a plain non-fiscal disclaimer (so it's never
  // mistaken for a factura), unlike the kitchen ticket's bare, paper-saving footer.
  const buffer=await renderReceipt({brand:'GASTRO CORE',kind:'PEDIDO',numero:order.numero,
   fields,note:order.observaciones?{title:'Observaciones',text:order.observaciones}:null,
   lines,emptyText:'No hay productos activos en esta orden.',
   footer:'¡Gracias por tu visita! Esperamos verte pronto.\nDocumento no fiscal.'});
  return {buffer,filename:'pedido-'+order.numero+'.pdf'};
 }
 async list(u:Principal,q:OrderListDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'orders.read',q.sucursalId);
   const where:Prisma.OrdenWhereInput={sucursalId:q.sucursalId,
    ...(q.estado?{estado:q.estado}:{}),...(q.modalidad?{modalidad:q.modalidad}:{}),
    ...(q.search?{numero:{contains:q.search,mode:'insensitive'}}:{}),
    ...(q.clienteId?{clienteId:q.clienteId}:{})};
   const [data,total]=await Promise.all([
    tx.orden.findMany({where,select:{id:true,numero:true,modalidad:true,origen:true,
     estado:true,version:true,total:true,abiertaEn:true,ocupacionMesaId:true,
     clienteId:true,cliente:{select:{id:true,nombre:true}}},
     orderBy:{abiertaEn:'desc'},skip:(q.page-1)*q.limit,take:q.limit}),
    tx.orden.count({where})]);
   return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 /** Priced read-only preview; never reserves inventory or authorizes payment. */
 async quoteOrder(u:Principal,d:QuoteOrderDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'orders.create',d.sucursalId);
   const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!branch?.activa)throw new ConflictException('Sucursal inexistente o inactiva');
   const priced=[];
   for(const item of d.lineas){
    const q=await this.quote(tx,u,d.sucursalId,item);
    priced.push({varianteId:q.varianteId,nombre:q.nombre,
     cantidad:q.cantidad.toFixed(3),precioUnitario:q.unit.toFixed(2),
     subtotal:q.total.toFixed(2),descuento:q.discount.toFixed(2),
     total:q.total.minus(q.discount).toFixed(2),
     modificadores:q.modifiers.map(m=>({id:m.id,nombre:m.nombre,recargo:m.unit.toFixed(2)}))});
   }
   const subtotal=priced.reduce((sum,line)=>sum.plus(line.subtotal),new Prisma.Decimal(0));
   const discount=priced.reduce((sum,line)=>sum.plus(line.descuento),new Prisma.Decimal(0));
   const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:d.sucursalId}});
   return {sucursalId:d.sucursalId,moneda:config?.moneda??'GTQ',
    subtotal:subtotal.toFixed(2),descuentoTotal:discount.toFixed(2),
    total:subtotal.minus(discount).toFixed(2),lineas:priced,
    advertencia:'Cotización informativa: precios y existencias se validarán otra vez al confirmar'};
  });
 }
 /** One read for POS and table boards: accounts, pending products and kitchen progress. */
 async worklist(u:Principal,q:OrderListDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'orders.read',q.sucursalId);
   const where:Prisma.OrdenWhereInput={
    sucursalId:q.sucursalId,estado:q.estado??'ABIERTA',
    ...(q.modalidad?{modalidad:q.modalidad}:{}),
    ...(q.search?{numero:{contains:q.search,mode:'insensitive'}}:{})};
   const [rows,total]=await Promise.all([
    tx.orden.findMany({where,include:{
     ocupacionMesa:{select:{id:true,mesa:{select:{id:true,numero:true,sala:{select:{nombre:true}}}}}},
     cuentasComoOrden:{select:{id:true,total:true,pagado:true,estado:true}},
     ordenLineasComoOrden:{select:{id:true,cantidad:true,cantidadEnviada:true,canceladaEn:true}},
     comandasComoOrden:{select:{id:true,estado:true,comandaLineasComoComanda:{
      select:{canceladaEn:true,entregadaEn:true}}}},
     cliente:{select:{id:true,nombre:true}}
    },orderBy:[{abiertaEn:'desc'},{id:'desc'}],skip:(q.page-1)*q.limit,take:q.limit}),
    tx.orden.count({where})
   ]);
   const data=rows.map(order=>{
    const pagado=order.cuentasComoOrden.reduce((sum,c)=>sum.plus(c.pagado),new Prisma.Decimal(0));
    const needsProcessing=order.ordenLineasComoOrden.some(line=>
     !line.canceladaEn&&line.cantidadEnviada.lt(line.cantidad));
    const tickets=order.comandasComoOrden;
    const pending=tickets.filter(t=>t.estado==='PENDIENTE').length;
    const preparing=tickets.filter(t=>t.estado==='PREPARANDO').length;
    const toDeliver=tickets.filter(t=>t.estado==='LISTA'&&
     t.comandaLineasComoComanda.some(l=>!l.canceladaEn&&!l.entregadaEn)).length;
    return {id:order.id,numero:order.numero,modalidad:order.modalidad,
     estado:order.estado,version:order.version,abiertaEn:order.abiertaEn,
     ocupacionMesaId:order.ocupacionMesaId,mesa:order.ocupacionMesa?.mesa??null,
     cliente:order.cliente?{id:order.cliente.id,nombre:order.cliente.nombre}:null,
     total:order.total.toFixed(2),pagado:pagado.toFixed(2),
     saldo:Prisma.Decimal.max(0,order.total.minus(pagado)).toFixed(2),
     needsProcessing,kitchen:{pending,preparing,toDeliver}};
   });
   return {data,meta:{page:q.page,limit:q.limit,total,
    totalPages:Math.ceil(total/q.limit)}};
  });
 }
 /** Core insertion is shared by ordinary orders and single-transaction express checkout. */
 private async createCoreTx(tx:Tx,u:Principal,d:CreateOrderDto){
   if(d.modalidad==='MESA'&&!d.mesaId)throw new BadRequestException('Servicio MESA requiere mesaId');
   if(d.modalidad!=='MESA'&&d.mesaId)throw new BadRequestException('mesaId solo en modalidad MESA');
   if(d.modalidad==='DELIVERY'&&!d.direccionTexto)
    throw new BadRequestException('Servicio DELIVERY requiere direccionTexto');
   if(d.modalidad!=='DELIVERY'&&(d.direccionTexto||d.referenciaDireccion||d.telefonoContacto))
    throw new BadRequestException('Los datos de entrega solo aplican en modalidad DELIVERY');
   if(d.modalidad!=='MESA'&&d.personas)
    throw new BadRequestException('personas solo aplica en modalidad MESA');
   if(d.clienteId)await this.customerSelection.assertSelectableInTx(tx,u.id,d.sucursalId,d.clienteId);
   const occupant=d.mesaId?await this.tables.findOrOpen(tx,u,d.mesaId,d.sucursalId,d.personas):null;
   const order=await tx.orden.create({data:{
    sucursalId:d.sucursalId,numero:'ORD-'+randomUUID().slice(0,12),
    modalidad:d.modalidad,origen:d.origen??'CAJA',usuarioId:u.id,
    ocupacionMesaId:occupant?.id,clienteId:d.clienteId,observaciones:d.observaciones,
    claveOperacion:d.claveOperacion,solicitudHash:sha({actor:u.id,request:d})
   }});
   await tx.cuenta.create({data:{ordenId:order.id,nombre:'Cuenta principal'}});
   for(const item of d.lineas)await this.insertLine(tx,order.id,await this.quote(tx,u,d.sucursalId,item));
   await this.recalc(tx,order.id);
   // Chained Entrega creation: same transaction as the Orden, so a DELIVERY order never
   // commits without its delivery, and a failed delivery check rolls back the whole order.
   if(d.modalidad==='DELIVERY')await this.delivery.createForNewOrder(tx,u,
    {id:order.id,sucursalId:order.sucursalId,clienteId:order.clienteId,
     modalidad:order.modalidad,estado:order.estado,origen:order.origen},
    {direccionTexto:d.direccionTexto,referenciaDireccion:d.referenciaDireccion,
     telefonoContacto:d.telefonoContacto,repartidorId:d.repartidorId});
   const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:d.sucursalId}});
   if((d.enviarCocina??true)&&!config?.exigeCobroAntesPreparar)
    await this.kitchen.sendTx(tx,u,order.id,'orders.create');
   await audit(tx,u,'ORDER_CREATED','Orden',order.id,d.sucursalId,{lineas:d.lineas.length});
   await outbox(tx,'ORDER_CREATED','Orden',order.id,d.sucursalId);
   return {orderId:order.id};
 }
 async create(u:Principal,d:CreateOrderDto){
  const result=await this.engine.tx(async tx=>{
   // Authorization is outside runOnce so replay cannot bypass a revoked role.
   await this.engine.allowed(tx,u.id,'orders.create',d.sucursalId);
   const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!branch?.activa)throw new ConflictException('Sucursal inexistente o inactiva');
   if(d.clienteId)await this.customerSelection.assertVisibleInTx(tx,u.id,d.sucursalId,d.clienteId);
   return runOnce(tx,u,d.claveOperacion,'ORDER_CREATE',d,()=>this.createCoreTx(tx,u,d));
  });
  return this.detail(u,result.orderId);
 }

 /** Cashier express sale: create + stock + payment + close, all in ONE serializable tx.
  * PREPARADO and delayed bank confirmations remain on the standard order flow. */
 async quickCheckout(u:Principal,d:QuickCheckoutDto){
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'orders.create',d.sucursalId);
   await this.engine.allowed(tx,u.id,'payments.collect',d.sucursalId);
   const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!branch?.activa)throw new ConflictException('Sucursal inexistente o inactiva');
   if(d.clienteId)await this.customerSelection.assertVisibleInTx(tx,u.id,d.sucursalId,d.clienteId);
   return runOnce(tx,u,d.claveOperacion,'POS_QUICK_CHECKOUT',d,async()=>{
    if(!['MOSTRADOR','PARA_LLEVAR'].includes(d.modalidad)||d.mesaId)
     throw new BadRequestException('Cobro rápido solo para mostrador o para llevar');
    if(d.enviarCocina===false)throw new BadRequestException('Cobro rápido requiere procesar existencias');
    if(d.pagos.some(p=>p.metodo==='TRANSFERENCIA'))
     throw new BadRequestException('Transferencias pendientes requieren Cobros normal');
    const variantIds=[...new Set(d.lineas.map(l=>l.varianteId))];
    const variants=await tx.varianteProducto.findMany({where:{id:{in:variantIds}},
     select:{id:true,producto:{select:{tipo:true}}}});
    if(variants.length!==variantIds.length)throw new ConflictException('Producto no encontrado');
    if(variants.some(v=>v.producto.tipo==='PREPARADO'))
     throw new ConflictException('Los productos preparados usan el flujo de orden y Cocina');
    const created=await this.createCoreTx(tx,u,d);
    const account=await tx.cuenta.findFirstOrThrow({where:{ordenId:created.orderId},
     select:{id:true}});
    const payment=await this.payments.collectInTx(tx,u,account.id,{
     turnoId:d.turnoId,pagos:d.pagos,claveOperacion:d.claveOperacion
    });
    const current=await tx.orden.findUniqueOrThrow({where:{id:created.orderId}});
    if(current.estado==='ABIERTA'){
     // In branches requiring payment first, only now may stock be consumed.
     await this.kitchen.sendTx(tx,u,created.orderId,'orders.create');
     await this.payments.settleAfterProcessingTx(tx,u,created.orderId);
    }
    const final=await tx.orden.findUniqueOrThrow({where:{id:created.orderId}});
    const sale=await tx.venta.findUnique({where:{cuentaId:account.id}});
    if(final.estado!=='CERRADA'||!sale)
     throw new ConflictException('Venta no cerrada; operación revertida íntegramente');
    return {ordenId:created.orderId,numero:final.numero,ventaId:sale.id,
     estado:final.estado,total:sale.total.toFixed(2),pagoIds:payment.pagoIds};
   });
  });
 }
 /** Pay and dispatch in one serializable transaction; no success after partial handoff. */
 async payAndSend(u:Principal,id:string,d:CollectDto){
  return this.engine.tx(async tx=>{
   const order=await this.order(tx,id);
   await this.engine.allowed(tx,u.id,'payments.collect',order.sucursalId);
   const permission=order.usuarioId===u.id?'orders.create':'orders.manage';
   await this.engine.allowed(tx,u.id,permission,order.sucursalId);
   return runOnce(tx,u,d.claveOperacion,'ORDER_PAY_AND_SEND',{id,...d},async()=>{
    if(order.estado!=='ABIERTA')throw new ConflictException('Orden no está abierta');
    if(d.pagos.some(p=>p.metodo==='TRANSFERENCIA'))
     throw new BadRequestException('La transferencia debe verificarse antes de enviar a Cocina');
    const accounts=await tx.cuenta.findMany({where:{ordenId:id},
     select:{id:true,estado:true}});
    if(accounts.length!==1||accounts[0].estado!=='ABIERTA')
     throw new ConflictException('Para cuentas divididas utilice Cobros');
    if(await tx.intentoPago.count({where:{cuentaId:accounts[0].id,estado:'PENDIENTE'}}))
     throw new ConflictException('Existen transferencias pendientes de confirmación');
    const paid=await this.payments.collectInTx(tx,u,accounts[0].id,d);
    // Payment-before-preparation MUST NOT dispatch stock/recipes on an advance.
    // Partial payments use ordinary PAY-A without automatic kitchen dispatch.
    const settledAccount=await tx.cuenta.findUniqueOrThrow({where:{id:accounts[0].id},
     select:{total:true,pagado:true}});
    if(settledAccount.pagado.lt(settledAccount.total))
     throw new ConflictException('Para cobrar y enviar, la cuenta debe quedar pagada completamente');
    const current=await tx.orden.findUniqueOrThrow({where:{id}});
    if(current.estado==='ABIERTA')
     await this.kitchen.sendTx(tx,u,id,permission);
    const after=await tx.orden.findUniqueOrThrow({where:{id}});
    const pending=await tx.comanda.count({where:{ordenId:id,
     estado:{in:['PENDIENTE','PREPARANDO']}}});
    return {ordenId:id,estado:after.estado,pagoIds:paid.pagoIds,
     comandasPendientes:pending};
   });
  });
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
   const shipment=await tx.entrega.findUnique({where:{ordenId:id}});
   if(shipment?.estado==='ENTREGADA')
    throw new ConflictException('La entrega ya fue realizada; use el proceso de devolución');
   if(shipment?.estado==='EN_REPARTO')
    throw new ConflictException('Cancele la entrega en reparto antes de cancelar la orden');
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
   if(shipment?.estado==='PENDIENTE'){
    await tx.entrega.update({where:{id:shipment.id},data:{estado:'CANCELADA'}});
    await tx.entregaEvento.create({data:{entregaId:shipment.id,usuarioId:u.id,
     accion:'DELIVERY_CANCELLED_WITH_ORDER',estadoAntes:'PENDIENTE',estadoDespues:'CANCELADA',
     repartidorAntesId:shipment.repartidorId,repartidorDespuesId:shipment.repartidorId,
     motivo:requireNote(d.motivo)}});
    await outbox(tx,'DELIVERY_CANCELLED_WITH_ORDER','Entrega',shipment.id,order.sucursalId);
   }
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
