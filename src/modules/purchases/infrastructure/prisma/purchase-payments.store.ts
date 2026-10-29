
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import {postVerifiedExternalMovement} from '../../../finance/infrastructure/prisma/finance-posting.js';
import {cash,covered} from '../../domain/purchase.policy.js';
import type {Actor,Tx} from './purchase-shared.js';
import {atomic,scope,audit,once,page,metadata} from './purchase-shared.js';
import type {Paging,SupplierPaymentDto,ApplyDto,KeyDto,ReasonKeyDto} from '../../presentation/http/dto/purchases.dto.js';
@Injectable()
export class PurchasePaymentsStore{
 constructor(private readonly db:PrismaService,private readonly cashStore:CashStore){}
 async list(u:Actor,q:Paging){
  if(!q.sucursalId)throw new BadRequestException('sucursalId requerido');
  return atomic(this.db,async tx=>{
   await scope(tx,u,q.sucursalId!,'purchases.read');
   const where:Prisma.PagoProveedorWhereInput={sucursalId:q.sucursalId,
    ...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([tx.pagoProveedor.findMany({where,...page(q),
    orderBy:{pagadoEn:'desc'},include:{aplicacionPagoProveedoresComoPago:true}}),
    tx.pagoProveedor.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async detail(u:Actor,id:string){
  return atomic(this.db,async tx=>{
   const p=await tx.pagoProveedor.findUnique({where:{id},
    include:{aplicacionPagoProveedoresComoPago:{include:{factura:true}}}});
   if(!p)throw new NotFoundException('Pago a proveedor inexistente');
   if(!p.sucursalId)throw new ConflictException('Pago histórico sin sucursal asignada');
   await scope(tx,u,p.sucursalId,'purchases.read');
   return p;
  });
 }
 private async applications(tx:Tx,payment:{id:string;proveedorId:string;sucursalId:string|null;monto:Prisma.Decimal},
  data:{facturaId:string;monto:string}[]){
  const seen=new Set<string>();let reserved=new Prisma.Decimal(0);
  const existing=await tx.aplicacionPagoProveedor.aggregate({where:{pagoId:payment.id},_sum:{monto:true}});
  reserved=reserved.plus(existing._sum.monto??0);
  const news=[];
  for(const row of data){
   if(seen.has(row.facturaId))throw new ConflictException('Factura repetida en la distribución');
   seen.add(row.facturaId);
   const amount=cash(row.monto);
   const invoice=await tx.facturaProveedor.findUnique({where:{id:row.facturaId}});
   if(!invoice||invoice.proveedorId!==payment.proveedorId||invoice.sucursalId!==payment.sucursalId||
    invoice.estado!=='CONFIRMADA')
    throw new ConflictException('Factura no confirmada o ajena al proveedor/sucursal');
   const [prior,credits]=await Promise.all([
    tx.aplicacionPagoProveedor.aggregate({where:{facturaId:row.facturaId,
     pago:{estado:'CONFIRMADO'}},_sum:{monto:true}}),
    tx.aplicacionNotaCreditoProveedor.aggregate({where:{facturaId:row.facturaId,
     nota:{estado:'CONFIRMADA'}},_sum:{monto:true}})]);
   const unpaid=invoice.total.minus(prior._sum.monto??0).minus(credits._sum.monto??0);
   covered(amount,unpaid,'Pago excede saldo de factura');
   reserved=reserved.plus(amount);
   news.push({facturaId:invoice.id,monto:amount});
  }
  covered(reserved,payment.monto,'Aplicaciones exceden el pago');
  return news;
 }
 private async confirmTx(tx:Tx,u:Actor,id:string){
  const p=await tx.pagoProveedor.findUnique({where:{id}});
  if(!p)throw new NotFoundException('Pago inexistente');
  if(!p.sucursalId)throw new ConflictException('Pago sin sucursal');
  await scope(tx,u,p.sucursalId,'purchases.payments.confirm');
  if(p.estado!=='PENDIENTE')throw new ConflictException('Pago no pendiente');
  // Revalidate at settlement time: two independently drafted payments cannot
  // settle the same outstanding invoice twice.
  const applications=await tx.aplicacionPagoProveedor.findMany({where:{pagoId:id}});
  for(const ap of applications){
   const invoice=await tx.facturaProveedor.findUniqueOrThrow({where:{id:ap.facturaId}});
   if(invoice.estado!=='CONFIRMADA'||invoice.proveedorId!==p.proveedorId||
      invoice.sucursalId!==p.sucursalId)
    throw new ConflictException('Factura no disponible para liquidación');
   const [payments,credits]=await Promise.all([
    tx.aplicacionPagoProveedor.aggregate({where:{facturaId:ap.facturaId,
     pago:{estado:'CONFIRMADO'}},_sum:{monto:true}}),
    tx.aplicacionNotaCreditoProveedor.aggregate({where:{facturaId:ap.facturaId,
     nota:{estado:'CONFIRMADA'}},_sum:{monto:true}})]);
   covered(ap.monto,invoice.total.minus(payments._sum.monto??0).minus(credits._sum.monto??0),
    'Factura liquidada por otra operación; no se puede confirmar doble pago');
  }
  if(p.metodo==='EFECTIVO'){
   if(!p.turnoCajaId)throw new ConflictException('Efectivo requiere turno');
   const shift=await this.cashStore.shiftTx(tx,u,p.turnoCajaId,'purchases.payments.confirm',false);
   if(shift.caja.sucursalId!==p.sucursalId)throw new ConflictException('Turno de otra sucursal');
   const moves=await tx.movimientoCaja.findMany({where:{turnoId:shift.id}});
   const available=moves.reduce((s,m)=>s.plus(m.tipo==='INGRESO'?m.monto:m.monto.neg()),
    shift.fondoInicial);
   if(p.monto.gt(available))throw new ConflictException('Caja sin efectivo suficiente');
   await tx.movimientoCaja.create({data:{turnoId:shift.id,tipo:'EGRESO',monto:p.monto,
    motivo:'Pago a proveedor',pagoProveedorId:p.id,usuarioId:u.id}});
  }else{
   if(!p.referencia?.trim())throw new ConflictException('Método externo requiere referencia verificada');
   if(p.cuentaFinancieraId){
    await postVerifiedExternalMovement(tx,{
     sucursalId:p.sucursalId,cuentaId:p.cuentaFinancieraId,
     referenciaTipo:'PAGO_PROVEEDOR',referenciaId:p.id,
     monto:p.monto.neg(),descripcion:'Pago confirmado a proveedor'
    });
   }
  }
  await tx.pagoProveedor.update({where:{id},data:{estado:'CONFIRMADO',
   confirmadoEn:new Date(),verificadoPorId:u.id}});
  await audit(tx,u,p.sucursalId,'PUR_PAYMENT_CONFIRMED','PagoProveedor',id);
  return {id,estado:'CONFIRMADO'};
 }
 async create(u:Actor,d:SupplierPaymentDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_PAYMENT_CREATE',d,async()=>{
   await scope(tx,u,d.sucursalId,'purchases.payments.create');
   if(!await tx.proveedor.findFirst({where:{id:d.proveedorId,activo:true}}))
    throw new ConflictException('Proveedor no disponible');
   if(d.metodo==='EFECTIVO'){
    if(!d.turnoCajaId)throw new BadRequestException('Pago en efectivo requiere turno');
    const shift=await this.cashStore.shiftTx(tx,u,d.turnoCajaId,'purchases.payments.create',false);
    if(shift.caja.sucursalId!==d.sucursalId)throw new ConflictException('Turno de otra sucursal');
   }else if(!d.referencia?.trim())throw new BadRequestException('Referencia externa obligatoria');
   if(d.metodo==='EFECTIVO'&&d.cuentaFinancieraId)
    throw new BadRequestException('El pago en efectivo no usa cuenta financiera externa');
   if(d.metodo!=='EFECTIVO'&&d.turnoCajaId)
    throw new BadRequestException('Pago externo no requiere turno de caja');
   if(d.cuentaFinancieraId){
    const [bank,branch]=await Promise.all([
     tx.cuentaFinanciera.findUnique({where:{id:d.cuentaFinancieraId}}),
     tx.sucursal.findUnique({where:{id:d.sucursalId},
      include:{configuracionSucursalesComoSucursal:true}})
    ]);
    if(!bank?.activa||bank.sucursalId!==d.sucursalId||!branch?.activa||
     bank.moneda!==(branch.configuracionSucursalesComoSucursal?.moneda??'GTQ'))
     throw new ConflictException('Cuenta financiera no disponible para este proveedor/sucursal');
   }
   const row=await tx.pagoProveedor.create({data:{proveedorId:d.proveedorId,sucursalId:d.sucursalId,
    monto:cash(d.monto),metodo:d.metodo,referencia:d.referencia?.trim(),
    turnoCajaId:d.turnoCajaId??null,
    cuentaFinancieraId:d.cuentaFinancieraId??null,usuarioId:u.id}});
   const lines=await this.applications(tx,row,d.aplicaciones);
   if(lines.length)await tx.aplicacionPagoProveedor.createMany({data:lines.map(x=>({...x,pagoId:row.id}))});
   await audit(tx,u,d.sucursalId,'PUR_PAYMENT_CREATED','PagoProveedor',row.id,
    {metodo:d.metodo,monto:d.monto});
   return {id:row.id,estado:'PENDIENTE'};
  }));
 }
 async apply(u:Actor,id:string,d:ApplyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_PAYMENT_APPLY',{id,...d},async()=>{
   const p=await tx.pagoProveedor.findUnique({where:{id}});
   if(!p||!p.sucursalId)throw new NotFoundException('Pago no encontrado');
   await scope(tx,u,p.sucursalId,'purchases.payments.create');
   if(p.estado!=='PENDIENTE'&&p.estado!=='CONFIRMADO')throw new ConflictException('Pago no aplicable');
   const lines=await this.applications(tx,p,d.aplicaciones);
   await tx.aplicacionPagoProveedor.createMany({data:lines.map(x=>({...x,pagoId:id}))});
   await audit(tx,u,p.sucursalId,'PUR_PAYMENT_APPLIED','PagoProveedor',id,{lineas:lines.length});
   return {id,aplicaciones:lines.length};
  }));
 }
 async confirm(u:Actor,id:string,d:KeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_PAYMENT_CONFIRM',{id},()=>this.confirmTx(tx,u,id)));
 }
 async reject(u:Actor,id:string,d:ReasonKeyDto){
  return atomic(this.db,tx=>once(tx,u,d.claveOperacion,'PUR_PAYMENT_REJECT',{id,...d},async()=>{
   const p=await tx.pagoProveedor.findUnique({where:{id}});
   if(!p||!p.sucursalId)throw new NotFoundException('Pago inexistente');
   await scope(tx,u,p.sucursalId,'purchases.payments.confirm');
   if(p.estado!=='PENDIENTE')throw new ConflictException('Solo se rechaza pago pendiente');
   await tx.pagoProveedor.update({where:{id},data:{estado:'RECHAZADO',motivoRechazo:d.motivo}});
   await audit(tx,u,p.sucursalId,'PUR_PAYMENT_REJECTED','PagoProveedor',id,{motivo:d.motivo});
   return {id,estado:'RECHAZADO'};
  }));
 }
}
