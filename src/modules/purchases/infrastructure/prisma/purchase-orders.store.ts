
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {dec,cents} from '../../domain/purchase.policy.js';
import type {Actor,Tx} from './purchase-shared.js';
import {atomic,scope,audit,page,metadata,once} from './purchase-shared.js';
import type {Paging,PurchaseOrderDto,ReasonKeyDto,KeyDto} from '../../presentation/http/dto/purchases.dto.js';
const includes={proveedor:true,ordenCompraLineasComoOrdenCompra:{include:{articulo:true,presentacion:true}},
 recepcionesCompraComoOrdenCompra:{include:{recepcionCompraLineasComoRecepcion:true}}} as const;
@Injectable()
export class PurchaseOrdersStore{
 constructor(private readonly db:PrismaService){}
 private async detailTx(tx:Tx,id:string){
  const row=await tx.ordenCompra.findUnique({where:{id},include:includes});
  if(!row)throw new NotFoundException('Compra inexistente');
  const lines=row.ordenCompraLineasComoOrdenCompra.map(l=>{
   const received=row.recepcionesCompraComoOrdenCompra.filter(r=>r.estado==='CONFIRMADO')
    .flatMap(r=>r.recepcionCompraLineasComoRecepcion).filter(r=>r.ordenCompraLineaId===l.id)
    .reduce((s,r)=>s.plus(r.cantidadCompra),new Prisma.Decimal(0));
   return {...l,recibido:received.toFixed(6),pendiente:Prisma.Decimal.max(0,l.cantidadCompra.minus(received)).toFixed(6)};
  });
  return {...row,lineas:lines,recepcionEstado:lines.every(x=>new Prisma.Decimal(x.pendiente).isZero())?'COMPLETA':
   lines.some(x=>new Prisma.Decimal(x.recibido).gt(0))?'PARCIAL':'SIN_RECIBIR'};
 }
 async list(u:Actor,q:Paging){
  if(!q.sucursalId)throw new BadRequestException('sucursalId requerido');
  return atomic(this.db,async tx=>{
   await scope(tx,u,q.sucursalId!,'purchases.read');
   const where:Prisma.OrdenCompraWhereInput={sucursalId:q.sucursalId,
    ...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([tx.ordenCompra.findMany({where,...page(q),
    orderBy:{creadaEn:'desc'},include:{proveedor:true,_count:{select:{ordenCompraLineasComoOrdenCompra:true}}}}),
    tx.ordenCompra.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async detail(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const row=await this.detailTx(tx,id);await scope(tx,u,row.sucursalId,'purchases.read');return row;
  });
 }
 private async validate(tx:Tx,d:PurchaseOrderDto){
  if(!await tx.proveedor.findFirst({where:{id:d.proveedorId,activo:true}}))
   throw new ConflictException('Proveedor no disponible');
  const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
  if(!branch?.activa)throw new ConflictException('Sucursal inactiva');
  const result=[];let total=new Prisma.Decimal(0);
  for(const l of d.lineas){
   const art=await tx.articuloInventario.findUnique({where:{id:l.articuloId}});
   if(!art?.activo)throw new ConflictException('Artículo no disponible');
   const factor=dec(l.factorAUnidadBase,10);
   if(l.presentacionId){
    const presentation=await tx.presentacionCompra.findUnique({where:{id:l.presentacionId}});
    if(!presentation?.activa||presentation.articuloId!==l.articuloId||
     presentation.proveedorId&&presentation.proveedorId!==d.proveedorId||
     !presentation.factorAUnidadBase.eq(factor))
     throw new ConflictException('Presentación incompatible con artículo/proveedor/factor');
   }else if(!factor.eq(1))throw new BadRequestException('Factor distinto de 1 requiere presentación');
   const quantity=dec(l.cantidadCompra),unit=dec(l.precioUnitarioCompra,6,true);
   const sub=cents(quantity.mul(unit));total=total.plus(sub);
   result.push({articuloId:l.articuloId,presentacionId:l.presentacionId??null,
    cantidadCompra:quantity,factorAUnidadBase:factor,precioUnitarioCompra:unit,subtotal:sub});
  }
  return {lines:result,total};
 }
 async create(u:Actor,d:PurchaseOrderDto){
  return atomic(this.db,async tx=>{
   await scope(tx,u,d.sucursalId,'purchases.orders.create');
   const validated=await this.validate(tx,d);
   const row=await tx.ordenCompra.create({data:{numero:'OC-'+randomUUID(),sucursalId:d.sucursalId,
    proveedorId:d.proveedorId,usuarioId:u.id,observaciones:d.observaciones?.trim(),
    precioIncluyeImpuesto:d.precioIncluyeImpuesto??false,totalEstimado:validated.total,
    ordenCompraLineasComoOrdenCompra:{create:validated.lines}}});
   await audit(tx,u,d.sucursalId,'PUR_ORDER_CREATED','OrdenCompra',row.id,{total:validated.total.toFixed(2)});
   return this.detailTx(tx,row.id);
  });
 }
 async edit(u:Actor,id:string,d:PurchaseOrderDto){
  return atomic(this.db,async tx=>{
   const row=await tx.ordenCompra.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Compra no encontrada');
   await scope(tx,u,row.sucursalId,'purchases.orders.create');
   if(row.estado!=='BORRADOR'||row.sucursalId!==d.sucursalId)
    throw new ConflictException('Compra confirmada o sucursal distinta');
   const validated=await this.validate(tx,d);
   await tx.ordenCompraLinea.deleteMany({where:{ordenCompraId:id}});
   await tx.ordenCompra.update({where:{id},data:{proveedorId:d.proveedorId,
    observaciones:d.observaciones?.trim(),precioIncluyeImpuesto:d.precioIncluyeImpuesto??false,
    totalEstimado:validated.total,ordenCompraLineasComoOrdenCompra:{create:validated.lines}}});
   await audit(tx,u,row.sucursalId,'PUR_ORDER_UPDATED','OrdenCompra',id);
   return this.detailTx(tx,id);
  });
 }
 async confirm(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_ORDER_CONFIRM',{id},async()=>{
   const row=await tx.ordenCompra.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Compra no encontrada');
   await scope(tx,u,row.sucursalId,'purchases.orders.approve');
   if(row.estado!=='BORRADOR')throw new ConflictException('Solo confirma borrador');
   await tx.ordenCompra.update({where:{id},data:{estado:'CONFIRMADA',confirmadaEn:new Date()}});
   await audit(tx,u,row.sucursalId,'PUR_ORDER_CONFIRMED','OrdenCompra',id);
   return {id,estado:'CONFIRMADA'};
  }));
 }
 async cancel(u:Actor,id:string,d:ReasonKeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_ORDER_CANCEL',{id,...d},async()=>{
   const row=await tx.ordenCompra.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Compra inexistente');
   await scope(tx,u,row.sucursalId,'purchases.orders.approve');
   if(row.estado!=='BORRADOR'&&row.estado!=='CONFIRMADA')
    throw new ConflictException('Orden no cancelable');
   if(await tx.recepcionCompra.count({where:{ordenCompraId:id,estado:'CONFIRMADO'}}))
    throw new ConflictException('Orden con recepción confirmada: use cierre administrativo');
   await tx.ordenCompra.update({where:{id},data:{estado:'CANCELADA',observaciones:d.motivo}});
   await audit(tx,u,row.sucursalId,'PUR_ORDER_CANCELLED','OrdenCompra',id,{motivo:d.motivo});
   return {id,estado:'CANCELADA'};
  }));
 }
 async close(u:Actor,id:string,d:ReasonKeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_ORDER_CLOSE',{id,...d},async()=>{
   const row=await tx.ordenCompra.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Compra inexistente');
   await scope(tx,u,row.sucursalId,'purchases.orders.approve');
   if(row.estado!=='CONFIRMADA')throw new ConflictException('Solo cierra compra confirmada');
   await tx.ordenCompra.update({where:{id},data:{estado:'CERRADA',cerradaEn:new Date(),motivoCierre:d.motivo}});
   await audit(tx,u,row.sucursalId,'PUR_ORDER_CLOSED','OrdenCompra',id,{motivo:d.motivo});
   return {id,estado:'CERRADA'};
  }));
 }
}
