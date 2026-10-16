
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import {cash,dec,covered,invoiceNumbers} from '../../domain/purchase.policy.js';
import type {Actor,Tx} from './purchase-shared.js';
import {atomic,scope,audit,once,branchOfWarehouse,page,metadata} from './purchase-shared.js';
import type {Paging,ReturnDto,CreditDto,CreditApplyDto,RefundSupplierDto,KeyDto} from '../../presentation/http/dto/purchases.dto.js';
@Injectable()
export class PurchaseReturnsStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine,
  private readonly shifts:CashStore){}
 async returns(u:Actor,q:Paging){
  if(!q.sucursalId)throw new BadRequestException('sucursalId requerido');
  return atomic(this.db,async tx=>{
   await scope(tx,u,q.sucursalId!,'purchases.read');
   const where={sucursalId:q.sucursalId,...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([tx.devolucionProveedor.findMany({where,include:{lineas:true},
    ...page(q),orderBy:{creadoEn:'desc'}}),tx.devolucionProveedor.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async returnDetail(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const row=await tx.devolucionProveedor.findUnique({where:{id},include:{lineas:true}});
   if(!row)throw new NotFoundException('Devolución inexistente');
   await scope(tx,u,row.sucursalId,'purchases.read');
   return row;
  });
 }
 async createReturn(u:Actor,d:ReturnDto){
  return atomic(this.db,async tx=>{
   const warehouse=await branchOfWarehouse(tx,d.almacenId);
   await scope(tx,u,warehouse.sucursalId,'purchases.returns.manage');
   if(!await tx.proveedor.findFirst({where:{id:d.proveedorId,activo:true}}))
    throw new ConflictException('Proveedor inexistente o inactivo');
   const lines=[];const seen=new Set<string>();
   for(const l of d.lineas){
    if(seen.has(l.recepcionLineaId))throw new ConflictException('Línea de recepción repetida');
    seen.add(l.recepcionLineaId);
    const receiptLine=await tx.recepcionCompraLinea.findUnique({where:{id:l.recepcionLineaId},
     include:{recepcion:{include:{almacen:true}}}});
    if(!receiptLine||receiptLine.recepcion.estado!=='CONFIRMADO'||
     receiptLine.recepcion.proveedorId!==d.proveedorId||
     receiptLine.recepcion.almacenId!==d.almacenId)
     throw new ConflictException('La línea no corresponde al proveedor/almacén');
    const amount=dec(l.cantidadBase);
    const prior=await tx.devolucionProveedorLinea.aggregate({where:{
     recepcionLineaId:l.recepcionLineaId,devolucion:{estado:'CONFIRMADA'}},_sum:{cantidadBase:true}});
    covered(amount,receiptLine.cantidadBase.minus(prior._sum.cantidadBase??0),
     'Devolución supera cantidad previamente recibida');
    lines.push({recepcionLineaId:l.recepcionLineaId,articuloId:receiptLine.articuloId,
     ubicacionId:receiptLine.ubicacionId,loteId:receiptLine.loteId,cantidadBase:amount});
   }
   const row=await tx.devolucionProveedor.create({data:{proveedorId:d.proveedorId,
    sucursalId:warehouse.sucursalId,almacenId:d.almacenId,usuarioId:u.id,
    motivo:d.motivo.trim(),lineas:{create:lines}}});
   await audit(tx,u,warehouse.sucursalId,'PUR_RETURN_CREATED','DevolucionProveedor',row.id);
   return {id:row.id,estado:row.estado};
  });
 }
 async confirmReturn(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_RETURN_CONFIRM',{id},async()=>{
   const row=await tx.devolucionProveedor.findUnique({where:{id},include:{lineas:true}});
   if(!row)throw new NotFoundException('Devolución inexistente');
   await scope(tx,u,row.sucursalId,'purchases.returns.manage');
   if(row.estado!=='BORRADOR'||!row.lineas.length)throw new ConflictException('Devolución no confirmable');
   const movementIds=[];
   for(const line of row.lineas){
    const receiptLine=await tx.recepcionCompraLinea.findUniqueOrThrow({where:{id:line.recepcionLineaId}});
    const prior=await tx.devolucionProveedorLinea.aggregate({where:{
     recepcionLineaId:line.recepcionLineaId,devolucion:{estado:'CONFIRMADA'}},_sum:{cantidadBase:true}});
    covered(line.cantidadBase,receiptLine.cantidadBase.minus(prior._sum.cantidadBase??0),
     'Se supera lo adquirido');
    const posted=await this.engine.post(tx,{
     actorId:u.id,ubicacionId:line.ubicacionId,articuloId:line.articuloId,loteId:line.loteId,
     cantidad:line.cantidadBase.toFixed(6),direction:'OUT',tipo:'DEVOLUCION',
     claveOperacion:'PUR:RETURN:'+id+':'+line.id,
     referenciaTipo:'DEVOLUCION_PROVEEDOR',referenciaId:id,
     nota:row.motivo,permission:'purchases.returns.manage'});
    await tx.devolucionProveedorLinea.update({where:{id:line.id},data:{
     costoContable:new Prisma.Decimal(posted.costoTotal),movimientoId:posted.movementId}});
    movementIds.push(posted.movementId);
   }
   await tx.devolucionProveedor.update({where:{id},data:{estado:'CONFIRMADA',confirmadoEn:new Date()}});
   await audit(tx,u,row.sucursalId,'PUR_RETURN_CONFIRMED','DevolucionProveedor',id,{lineas:movementIds.length});
   return {id,estado:'CONFIRMADA',movimientoIds};
  }));
 }
 async credits(u:Actor,q:Paging){
  if(!q.sucursalId)throw new BadRequestException('sucursalId requerido');
  return atomic(this.db,async tx=>{
   await scope(tx,u,q.sucursalId!,'purchases.read');
   const where={sucursalId:q.sucursalId,...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([tx.notaCreditoProveedor.findMany({where,...page(q),
    orderBy:{creadaEn:'desc'}}),tx.notaCreditoProveedor.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async creditDetail(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const row=await tx.notaCreditoProveedor.findUnique({where:{id},include:{aplicaciones:true,reintegros:true}});
   if(!row)throw new NotFoundException('Crédito inexistente');
   await scope(tx,u,row.sucursalId,'purchases.read');
   const applied=row.aplicaciones.reduce((s,a)=>s.plus(a.monto),new Prisma.Decimal(0));
   const refunded=row.reintegros.filter(x=>x.estado==='CONFIRMADO')
    .reduce((s,a)=>s.plus(a.monto),new Prisma.Decimal(0));
   return {...row,aplicado:applied.toFixed(2),reintegrado:refunded.toFixed(2),
    disponible:row.total.minus(applied).minus(refunded).toFixed(2)};
  });
 }
 async createCredit(u:Actor,d:CreditDto){
  return atomic(this.db,async tx=>{
   await scope(tx,u,d.sucursalId,'purchases.credits.manage');
   if(!await tx.proveedor.findUnique({where:{id:d.proveedorId}}))
    throw new NotFoundException('Proveedor inexistente');
   if(d.devolucionId){
    const ret=await tx.devolucionProveedor.findUnique({where:{id:d.devolucionId}});
    if(!ret||ret.proveedorId!==d.proveedorId||ret.sucursalId!==d.sucursalId||ret.estado!=='CONFIRMADA')
     throw new ConflictException('Devolución vinculada no confirmada o incompatible');
   }
   const row=await tx.notaCreditoProveedor.create({data:{
    proveedorId:d.proveedorId,sucursalId:d.sucursalId,
    numeroDocumento:invoiceNumbers(d.numeroDocumento),
    motivo:d.motivo.trim(),total:cash(d.total),devolucionId:d.devolucionId??null}});
   await audit(tx,u,d.sucursalId,'PUR_CREDIT_CREATED','NotaCreditoProveedor',row.id);
   return {id:row.id,estado:row.estado};
  });
 }
 async confirmCredit(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_CREDIT_CONFIRM',{id},async()=>{
   const row=await tx.notaCreditoProveedor.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Crédito inexistente');
   await scope(tx,u,row.sucursalId,'purchases.credits.manage');
   if(row.estado!=='BORRADOR')throw new ConflictException('Crédito ya confirmado/cancelado');
   await tx.notaCreditoProveedor.update({where:{id},data:{estado:'CONFIRMADA',confirmadaEn:new Date()}});
   await audit(tx,u,row.sucursalId,'PUR_CREDIT_CONFIRMED','NotaCreditoProveedor',id);
   return {id,estado:'CONFIRMADA'};
  }));
 }
 async applyCredit(u:Actor,id:string,d:CreditApplyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_CREDIT_APPLY',{id,...d},async()=>{
   const note=await tx.notaCreditoProveedor.findUnique({where:{id},include:{
    aplicaciones:true,reintegros:true}});
   if(!note)throw new NotFoundException('Crédito inexistente');
   await scope(tx,u,note.sucursalId,'purchases.credits.manage');
   if(note.estado!=='CONFIRMADA')throw new ConflictException('Nota de crédito no confirmada');
   const invoice=await tx.facturaProveedor.findUnique({where:{id:d.facturaId}});
   if(!invoice||invoice.proveedorId!==note.proveedorId||invoice.sucursalId!==note.sucursalId||
    invoice.estado!=='CONFIRMADA')throw new ConflictException('Factura ajena o no confirmada');
   const amt=cash(d.monto);
   const applied=note.aplicaciones.reduce((s,a)=>s.plus(a.monto),new Prisma.Decimal(0));
   const returned=note.reintegros.filter(x=>x.estado==='CONFIRMADO'||x.estado==='PENDIENTE')
    .reduce((s,a)=>s.plus(a.monto),new Prisma.Decimal(0));
   covered(amt,note.total.minus(applied).minus(returned),'Crédito insuficiente');
   const [payments,credits]=await Promise.all([
    tx.aplicacionPagoProveedor.aggregate({where:{facturaId:invoice.id,pago:{estado:'CONFIRMADO'}},
     _sum:{monto:true}}),
    tx.aplicacionNotaCreditoProveedor.aggregate({where:{facturaId:invoice.id},
     _sum:{monto:true}})]);
   covered(amt,invoice.total.minus(payments._sum.monto??0).minus(credits._sum.monto??0),
    'Crédito excede deuda disponible');
   await tx.aplicacionNotaCreditoProveedor.create({data:{notaId:id,facturaId:invoice.id,monto:amt}});
   await audit(tx,u,note.sucursalId,'PUR_CREDIT_APPLIED','NotaCreditoProveedor',id,
    {facturaId:invoice.id,monto:d.monto});
   return {id,facturaId:invoice.id,aplicado:d.monto};
  }));
 }
 async createSupplierRefund(u:Actor,d:RefundSupplierDto){
  return atomic(this.db,async tx=>{
   const note=await tx.notaCreditoProveedor.findUnique({where:{id:d.notaId},include:{
    aplicaciones:true,reintegros:true}});
   if(!note)throw new NotFoundException('Crédito inexistente');
   await scope(tx,u,note.sucursalId,'purchases.credits.manage');
   if(note.estado!=='CONFIRMADA')throw new ConflictException('Nota no confirmada');
   const applied=note.aplicaciones.reduce((s,a)=>s.plus(a.monto),new Prisma.Decimal(0));
   const refunds=note.reintegros.filter(x=>x.estado!=='RECHAZADO')
    .reduce((s,a)=>s.plus(a.monto),new Prisma.Decimal(0));
   covered(cash(d.monto),note.total.minus(applied).minus(refunds),'Crédito disponible insuficiente');
   if(d.metodo==='EFECTIVO'){
    if(!d.turnoCajaId)throw new BadRequestException('Reintegro en efectivo requiere turno abierto');
    const shift=await this.shifts.shiftTx(tx,u,d.turnoCajaId,'purchases.credits.manage',false);
    if(shift.caja.sucursalId!==note.sucursalId)throw new ConflictException('Turno en otra sucursal');
   }else if(!d.referencia?.trim())throw new BadRequestException('Reintegro externo requiere referencia');
   const row=await tx.reintegroProveedor.create({data:{notaId:note.id,metodo:d.metodo,
    monto:cash(d.monto),turnoCajaId:d.turnoCajaId??null,referencia:d.referencia?.trim(),
    usuarioId:u.id}});
   await audit(tx,u,note.sucursalId,'PUR_REFUND_CREATED','ReintegroProveedor',row.id);
   return {id:row.id,estado:'PENDIENTE'};
  });
 }
 async confirmSupplierRefund(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_REFUND_CONFIRM',{id},async()=>{
   const row=await tx.reintegroProveedor.findUnique({where:{id},include:{nota:true}});
   if(!row)throw new NotFoundException('Reintegro inexistente');
   await scope(tx,u,row.nota.sucursalId,'purchases.credits.manage');
   if(row.estado!=='PENDIENTE')throw new ConflictException('Reintegro ya resuelto');
   let movementId:string|null=null;
   if(row.metodo==='EFECTIVO'){
    if(!row.turnoCajaId)throw new ConflictException('Falta turno de reintegro');
    const shift=await this.shifts.shiftTx(tx,u,row.turnoCajaId,'purchases.credits.manage',false);
    if(shift.caja.sucursalId!==row.nota.sucursalId)throw new ConflictException('Turno de otra sucursal');
    const mov=await tx.movimientoCaja.create({data:{turnoId:shift.id,tipo:'INGRESO',
     monto:row.monto,motivo:'Reintegro del proveedor',usuarioId:u.id}});
    movementId=mov.id;
   }else if(!row.referencia?.trim())throw new ConflictException('Reintegro externo sin referencia');
   await tx.reintegroProveedor.update({where:{id},data:{
    estado:'CONFIRMADO',confirmadoEn:new Date(),movimientoCajaId:movementId}});
   await audit(tx,u,row.nota.sucursalId,'PUR_REFUND_CONFIRMED','ReintegroProveedor',id);
   return {id,estado:'CONFIRMADO',movimientoCajaId:movementId};
  }));
 }
}
