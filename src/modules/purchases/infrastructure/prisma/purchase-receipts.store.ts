
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {dec,cents,f,covered,taxLine} from '../../domain/purchase.policy.js';
import type {Actor,Tx} from './purchase-shared.js';
import {atomic,scope,audit,page,metadata,once,branchOfWarehouse} from './purchase-shared.js';
import type {Paging,ReceiptDto,KeyDto} from '../../presentation/http/dto/purchases.dto.js';
const includes={proveedor:true,almacen:true,recepcionCompraLineasComoRecepcion:{
 include:{articulo:true,ubicacion:true,lote:true,ordenCompraLinea:true}}} as const;
@Injectable()
export class PurchaseReceiptsStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine){}
 async list(u:Actor,q:Paging){
  if(!q.sucursalId)throw new BadRequestException('sucursalId requerido');
  return atomic(this.db,async tx=>{
   await scope(tx,u,q.sucursalId!,'purchases.read');
   const where:Prisma.RecepcionCompraWhereInput={almacen:{sucursalId:q.sucursalId},
    ...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([tx.recepcionCompra.findMany({where,...page(q),
    include:{proveedor:true,almacen:true},orderBy:{creadoEn:'desc'}}),
    tx.recepcionCompra.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async detail(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const row=await tx.recepcionCompra.findUnique({where:{id},include:includes});
   if(!row)throw new NotFoundException('Recepción inexistente');
   await scope(tx,u,row.almacen.sucursalId,'purchases.read');
   return row;
  });
 }
 private async validate(tx:Tx,d:ReceiptDto){
  const warehouse=await branchOfWarehouse(tx,d.almacenId);
  if(!await tx.proveedor.findFirst({where:{id:d.proveedorId,activo:true}}))
   throw new ConflictException('Proveedor no disponible');
  if(!d.ordenCompraId&&!d.referenciaProveedor?.trim()&&!d.observaciones?.trim())
   throw new BadRequestException('Recepción directa requiere referencia o motivo');
  const order=d.ordenCompraId?await tx.ordenCompra.findUnique({where:{id:d.ordenCompraId}}):null;
  if(d.ordenCompraId&&(!order||order.estado!=='CONFIRMADA'||order.proveedorId!==d.proveedorId||
   order.sucursalId!==warehouse.sucursalId))
   throw new ConflictException('Orden de compra inválida para esta recepción');
  const seen=new Set<string>();let amount=new Prisma.Decimal(0);
  const lines=[];
  for(const l of d.lineas){
   const article=await tx.articuloInventario.findUnique({where:{id:l.articuloId}});
   if(!article?.activo)throw new ConflictException('Artículo inactivo');
   const location=await tx.ubicacionAlmacen.findUnique({where:{id:l.ubicacionId}});
   if(!location?.activa||location.almacenId!==warehouse.id)
    throw new ConflictException('Ubicación no pertenece al almacén');
   if(article.requiereLote!==!!l.loteId)throw new ConflictException('Control de lote incompatible');
   if(l.loteId){
    const lot=await tx.loteInventario.findUnique({where:{id:l.loteId}});
    if(!lot||lot.articuloId!==article.id||article.requiereVencimiento&&!lot.fechaVencimiento)
     throw new ConflictException('Lote no válido para artículo');
   }
   if(!!order!==!!l.ordenCompraLineaId)throw new BadRequestException('Vinculación OC/línea inconsistente');
   const orderLine=l.ordenCompraLineaId?
    await tx.ordenCompraLinea.findUnique({where:{id:l.ordenCompraLineaId}}):null;
   const factor=dec(l.factorAUnidadBase,10);
   if(order&&(!orderLine||orderLine.ordenCompraId!==order.id||orderLine.articuloId!==article.id||
    !orderLine.factorAUnidadBase.eq(factor)))throw new ConflictException('Línea OC incompatible');
   if(!order&&!factor.eq(1)){
    // Direct receipts may use a registered supplier presentation.
    if(!await tx.presentacionCompra.findFirst({where:{articuloId:article.id,
     proveedorId:d.proveedorId,activa:true,factorAUnidadBase:factor}}))
     throw new ConflictException('Factor directo requiere presentación de proveedor válida');
   }
   const lineKey=[l.ordenCompraLineaId??article.id,l.ubicacionId,l.loteId??''].join(':');
   if(seen.has(lineKey))throw new ConflictException('Línea de recepción duplicada');
   seen.add(lineKey);
   const q=dec(l.cantidadCompra),rejected=dec(l.cantidadRechazada??'0',6,true);
   if(rejected.gt(q))throw new BadRequestException('Cantidad rechazada excede lo entregado');
   const accepted=q.minus(rejected);
   if(!accepted.gt(0))throw new BadRequestException('La recepción requiere cantidad aceptada');
   const base=accepted.mul(factor);
   if(base.decimalPlaces()>6||!base.gt(0))throw new ConflictException('Conversión a unidad base no exacta');
   const unit=dec(l.precioUnitarioCompra,6,true);
   const rate=dec(l.tasaImpuesto??orderLine?.tasaImpuesto.toFixed(6)??'0',6,true);
   if(orderLine&&(!orderLine.tasaImpuesto.eq(rate)||
     orderLine.impuestoRecuperable!==(l.impuestoRecuperable??orderLine.impuestoRecuperable)))
    throw new ConflictException('Tratamiento fiscal difiere de la orden de compra');
   const recoverable=l.impuestoRecuperable??orderLine?.impuestoRecuperable??false;
   const inclusive=d.precioIncluyeImpuesto??order?.precioIncluyeImpuesto??false;
   if(order&&inclusive!==order.precioIncluyeImpuesto)
    throw new ConflictException('Modalidad de impuesto distinta a la orden');
   const tax=taxLine(accepted,unit,rate,inclusive);
   const capitalized=tax.base.plus(recoverable?new Prisma.Decimal(0):tax.tax);
   amount=amount.plus(tax.total);
   lines.push({articuloId:l.articuloId,ubicacionId:l.ubicacionId,loteId:l.loteId??null,
    ordenCompraLineaId:l.ordenCompraLineaId??null,cantidadCompra:accepted,
    cantidadRechazada:rejected,factorAUnidadBase:factor,cantidadBase:base,
    precioUnitarioCompra:unit,tasaImpuesto:rate,importeImpuesto:tax.tax,
    importeComercial:tax.total,precioIncluyeImpuesto:inclusive,impuestoRecuperable:recoverable,
    costoTotal:capitalized});
  }
  return {warehouse,order,lines,amount};
 }
 async create(u:Actor,d:ReceiptDto){
  return atomic(this.db,async tx=>{
   const {warehouse,lines}=await this.validate(tx,d);
   await scope(tx,u,warehouse.sucursalId,'purchases.receipts.create');
   const row=await tx.recepcionCompra.create({data:{numero:'RC-'+randomUUID(),
    proveedorId:d.proveedorId,ordenCompraId:d.ordenCompraId??null,almacenId:d.almacenId,
    usuarioId:u.id,referenciaProveedor:d.referenciaProveedor?.trim(),observaciones:d.observaciones?.trim(),
    recepcionCompraLineasComoRecepcion:{create:lines}}});
   await audit(tx,u,warehouse.sucursalId,'PUR_RECEIPT_CREATED','RecepcionCompra',row.id);
   return {id:row.id,estado:row.estado};
  });
 }
 async edit(u:Actor,id:string,d:ReceiptDto){
  return atomic(this.db,async tx=>{
   const old=await tx.recepcionCompra.findUnique({where:{id},include:{almacen:true}});
   if(!old)throw new NotFoundException('Recepción inexistente');
   await scope(tx,u,old.almacen.sucursalId,'purchases.receipts.create');
   if(old.estado!=='BORRADOR')throw new ConflictException('Solo editar borrador');
   const valid=await this.validate(tx,d);
   if(valid.warehouse.sucursalId!==old.almacen.sucursalId)throw new ConflictException('Cambio de sucursal prohibido');
   await tx.recepcionCompraLinea.deleteMany({where:{recepcionId:id}});
   await tx.recepcionCompra.update({where:{id},data:{proveedorId:d.proveedorId,
    almacenId:d.almacenId,ordenCompraId:d.ordenCompraId??null,
    referenciaProveedor:d.referenciaProveedor?.trim(),observaciones:d.observaciones?.trim(),
    recepcionCompraLineasComoRecepcion:{create:valid.lines}}});
   await audit(tx,u,old.almacen.sucursalId,'PUR_RECEIPT_UPDATED','RecepcionCompra',id);
   return {id,estado:'BORRADOR'};
  });
 }
 async confirm(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_RECEIPT_CONFIRM',{id},async()=>{
   const receipt=await tx.recepcionCompra.findUnique({where:{id},include:{almacen:true,
    recepcionCompraLineasComoRecepcion:true}});
   if(!receipt)throw new NotFoundException('Recepción inexistente');
   await scope(tx,u,receipt.almacen.sucursalId,'purchases.receipts.confirm');
   if(receipt.estado!=='BORRADOR')throw new ConflictException('Recepción no está en borrador');
   if(!receipt.recepcionCompraLineasComoRecepcion.length)throw new ConflictException('Recepción sin líneas');
   // Inspect accumulated accepted quantities across all confirmed sibling receipts.
   for(const line of receipt.recepcionCompraLineasComoRecepcion){
    if(line.ordenCompraLineaId){
     const ordered=await tx.ordenCompraLinea.findUniqueOrThrow({where:{id:line.ordenCompraLineaId}});
     const past=await tx.recepcionCompraLinea.aggregate({where:{
      ordenCompraLineaId:line.ordenCompraLineaId,recepcion:{estado:'CONFIRMADO'}},_sum:{cantidadCompra:true}});
     const inDraft=receipt.recepcionCompraLineasComoRecepcion.filter(l=>l.ordenCompraLineaId===line.ordenCompraLineaId)
      .reduce((s,l)=>s.plus(l.cantidadCompra),new Prisma.Decimal(0));
     covered(inDraft,ordered.cantidadCompra.minus(past._sum.cantidadCompra??0),
      'La recepción excede la cantidad contratada');
    }
   }
   const movements=[];
   for(const line of receipt.recepcionCompraLineasComoRecepcion){
    const base=dec(line.cantidadBase.toFixed(6));
    const unit=line.costoTotal.div(base).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
    const entry=await this.engine.post(tx,{actorId:u.id,articuloId:line.articuloId,
     ubicacionId:line.ubicacionId,loteId:line.loteId,cantidad:f(base,6),
     direction:'IN',tipo:'COMPRA',costoUnitario:f(unit,6),
     claveOperacion:'PUR:RC:'+receipt.id+':'+line.id,
     referenciaTipo:'RECEPCION_COMPRA',referenciaId:receipt.id,
     permission:'purchases.receipts.confirm',nota:'Recepción a proveedor '+receipt.proveedorId});
    await tx.recepcionCompraLinea.update({where:{id:line.id},data:{movimientoId:entry.movementId}});
    movements.push(entry.movementId);
   }
   await tx.recepcionCompra.update({where:{id},data:{estado:'CONFIRMADO',recibidoEn:new Date()}});
   await audit(tx,u,receipt.almacen.sucursalId,'PUR_RECEIPT_CONFIRMED','RecepcionCompra',id,
    {movimientos:movements.length});
   return {id,estado:'CONFIRMADO',movimientoIds:movements};
  }));
 }
 async cancel(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_RECEIPT_CANCEL',{id},async()=>{
   const r=await tx.recepcionCompra.findUnique({where:{id},include:{almacen:true}});
   if(!r)throw new NotFoundException('Recepción inexistente');
   await scope(tx,u,r.almacen.sucursalId,'purchases.receipts.create');
   if(r.estado!=='BORRADOR')throw new ConflictException('Solo cancelable en borrador');
   await tx.recepcionCompra.update({where:{id},data:{estado:'CANCELADO'}});
   await audit(tx,u,r.almacen.sucursalId,'PUR_RECEIPT_CANCELLED','RecepcionCompra',id);
   return {id,estado:'CANCELADO'};
  }));
 }
 async movements(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const r=await tx.recepcionCompra.findUnique({where:{id},include:{almacen:true}});
   if(!r)throw new NotFoundException('Recepción inexistente');
   await scope(tx,u,r.almacen.sucursalId,'purchases.read');
   return tx.movimientoInventario.findMany({where:{referenciaTipo:'RECEPCION_COMPRA',referenciaId:id}});
  });
 }
}
