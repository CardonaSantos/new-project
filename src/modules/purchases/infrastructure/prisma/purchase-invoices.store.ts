
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {cash,dec,taxLine,invoiceNumbers} from '../../domain/purchase.policy.js';
import type {Actor,Tx} from './purchase-shared.js';
import {atomic,scope,audit,once,page,metadata} from './purchase-shared.js';
import type {Paging,InvoiceDto,KeyDto,ReasonKeyDto} from '../../presentation/http/dto/purchases.dto.js';
const full={proveedor:true,facturaProveedorLineasComoFactura:{include:{recepcionLinea:true,articulo:true}},
 aplicacionPagoProveedoresComoFactura:{include:{pago:true}},aplicacionesNotaCredito:{include:{nota:true}}} as const;
@Injectable()
export class PurchaseInvoicesStore{
 constructor(private readonly db:PrismaService){}
 async list(u:Actor,q:Paging){
  if(!q.sucursalId)throw new BadRequestException('sucursalId requerido');
  return atomic(this.db,async tx=>{
   await scope(tx,u,q.sucursalId!,'purchases.read');
   const where:Prisma.FacturaProveedorWhereInput={sucursalId:q.sucursalId,
    ...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([
    tx.facturaProveedor.findMany({where,include:{proveedor:true},...page(q),orderBy:{creadaEn:'desc'}}),
    tx.facturaProveedor.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async detail(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const row=await this.details(tx,id);
   await scope(tx,u,row.sucursalId,'purchases.read');
   return row;
  });
 }
 private async details(tx:Tx,id:string){
  const row=await tx.facturaProveedor.findUnique({where:{id},include:full});
  if(!row)throw new NotFoundException('Factura inexistente');
  const paid=row.aplicacionPagoProveedoresComoFactura.filter(x=>x.pago.estado==='CONFIRMADO')
   .reduce((s,x)=>s.plus(x.monto),new Prisma.Decimal(0));
  const credit=row.aplicacionesNotaCredito.filter(x=>x.nota.estado==='CONFIRMADA')
   .reduce((s,x)=>s.plus(x.monto),new Prisma.Decimal(0));
  return {...row,pagado:paid.toFixed(2),acreditado:credit.toFixed(2),
   saldo:Prisma.Decimal.max(0,row.total.minus(paid).minus(credit)).toFixed(2)};
 }
 // Validar contra recepciones CONFIRMADAS, nunca contra borradores. El contrato
 // usa la cantidad comercial aceptada (no cantidadBase ni cantidadRechazada).
 private async ensureReceiptCoverage(tx:Tx,
  lines:{recepcionLineaId:string|null;cantidad:Prisma.Decimal}[]){
  const requested=new Map<string,Prisma.Decimal>();
  for(const line of lines){
   if(!line.recepcionLineaId)continue; // facturas de servicios / gastos sin recepción
   requested.set(line.recepcionLineaId,
    (requested.get(line.recepcionLineaId)??new Prisma.Decimal(0)).plus(line.cantidad));
  }
  for(const [recepcionLineaId,quantity] of requested){
   const received=await tx.recepcionCompraLinea.findUnique({
    where:{id:recepcionLineaId},include:{recepcion:true}});
   if(!received||received.recepcion.estado!=='CONFIRMADO')
    throw new ConflictException('Línea de recepción no confirmada');
   const previous=await tx.facturaProveedorLinea.aggregate({
    where:{recepcionLineaId,factura:{estado:'CONFIRMADA'}},
    _sum:{cantidad:true}});
   const available=received.cantidadCompra.minus(previous._sum.cantidad??0);
   if(quantity.gt(available))
    throw new ConflictException('Cantidad facturada excede lo aceptado en la recepción');
  }
 }
 private async validate(tx:Tx,d:InvoiceDto){
  const supplier=await tx.proveedor.findUnique({where:{id:d.proveedorId}});
  const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
  if(!supplier?.activo||!branch?.activa)throw new ConflictException('Proveedor/sucursal inactivos');
  const lines=[];let subtotal=new Prisma.Decimal(0),tax=new Prisma.Decimal(0);
  for(const line of d.lineas){
   const qty=dec(line.cantidad),unit=dec(line.precioUnitario,6,true);
   const rate=dec(line.tasaImpuesto??'0',6,true);
   if(rate.gt(1))throw new BadRequestException('Tasa mayor a 100%');
   if(line.articuloId&&!await tx.articuloInventario.findUnique({where:{id:line.articuloId}}))
    throw new ConflictException('Artículo de factura inexistente');
   if(line.recepcionLineaId){
    const receiptLine=await tx.recepcionCompraLinea.findUnique({where:{id:line.recepcionLineaId},
     include:{recepcion:{include:{almacen:true}}}});
    if(!receiptLine||receiptLine.recepcion.estado!=='CONFIRMADO'||
      receiptLine.recepcion.proveedorId!==d.proveedorId||
      receiptLine.recepcion.almacen.sucursalId!==d.sucursalId||
      line.articuloId&&receiptLine.articuloId!==line.articuloId)
     throw new ConflictException('Recepción de factura no coincide con proveedor/sucursal/artículo');
   }
   const t=taxLine(qty,unit,rate,d.precioIncluyeImpuesto);
   subtotal=subtotal.plus(t.base);tax=tax.plus(t.tax);
   lines.push({recepcionLineaId:line.recepcionLineaId??null,
    articuloId:line.articuloId??null,descripcion:line.descripcion.trim(),
    cantidad:qty,precioUnitario:unit,subtotal:t.base,
    tasaImpuesto:rate,importeImpuesto:t.tax});
  }
  await this.ensureReceiptCoverage(tx,lines);
  return {lines,subtotal,tax,total:subtotal.plus(tax)};
 }
 async create(u:Actor,d:InvoiceDto){
  return atomic(this.db,async tx=>{
   await scope(tx,u,d.sucursalId,'purchases.invoices.manage');
   const values=await this.validate(tx,d);
   const row=await tx.facturaProveedor.create({data:{
    proveedorId:d.proveedorId,sucursalId:d.sucursalId,
    numeroDocumento:invoiceNumbers(d.numeroDocumento),fechaEmision:new Date(d.fechaEmision+'T00:00:00Z'),
    fechaVencimiento:d.fechaVencimiento?new Date(d.fechaVencimiento+'T00:00:00Z'):null,
    referenciaFiscal:d.referenciaFiscal?.trim(),observaciones:d.observaciones?.trim(),
    subtotal:values.subtotal,impuestos:values.tax,total:values.total,
    precioIncluyeImpuesto:d.precioIncluyeImpuesto,
    facturaProveedorLineasComoFactura:{create:values.lines}
   }});
   await audit(tx,u,d.sucursalId,'PUR_INVOICE_CREATED','FacturaProveedor',row.id,
    {total:values.total.toFixed(2)});
   return this.details(tx,row.id);
  });
 }
 async confirm(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_INVOICE_CONFIRM',{id},async()=>{
   const row=await tx.facturaProveedor.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Factura inexistente');
   await scope(tx,u,row.sucursalId,'purchases.invoices.confirm');
   if(row.estado!=='BORRADOR')throw new ConflictException('Factura no está en borrador');
   const invoiceLines=await tx.facturaProveedorLinea.findMany({
    where:{facturaId:id},select:{recepcionLineaId:true,cantidad:true}});
   await this.ensureReceiptCoverage(tx,invoiceLines);
   await tx.facturaProveedor.update({where:{id},data:{estado:'CONFIRMADA',confirmadaEn:new Date()}});
   await audit(tx,u,row.sucursalId,'PUR_INVOICE_CONFIRMED','FacturaProveedor',id);
   return {id,estado:'CONFIRMADA'};
  }));
 }
 async cancel(u:Actor,id:string,d:ReasonKeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_INVOICE_CANCEL',{id,...d},async()=>{
   const row=await tx.facturaProveedor.findUnique({where:{id},include:{
    aplicacionPagoProveedoresComoFactura:true,aplicacionesNotaCredito:true}});
   if(!row)throw new NotFoundException('Factura inexistente');
   await scope(tx,u,row.sucursalId,'purchases.invoices.confirm');
   if(row.estado==='ANULADA'||row.aplicacionPagoProveedoresComoFactura.length||
     row.aplicacionesNotaCredito.length)
    throw new ConflictException('Factura con aplicaciones: requiere ajuste formal');
   await tx.facturaProveedor.update({where:{id},data:{
    estado:'ANULADA',anuladaEn:new Date(),motivoAnulacion:d.motivo}});
   await audit(tx,u,row.sucursalId,'PUR_INVOICE_CANCELLED','FacturaProveedor',id,{motivo:d.motivo});
   return {id,estado:'ANULADA'};
  }));
 }
}
