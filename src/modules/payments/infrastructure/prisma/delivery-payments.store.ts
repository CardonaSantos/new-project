import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {DeliveryPaymentsPort} from '../../application/ports/delivery-payments.port.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {money,ensureCoverage} from '../../domain/payment.policy.js';
import {allowed} from './payment-shared.js';
import {assertFinancialPeriodOpen} from '../../../finance/infrastructure/prisma/finance-period.guard.js';
type Tx=Prisma.TransactionClient;

/** PAY-A owns Pago recognition. Caller owns the SERIALIZABLE transaction. */
@Injectable()
export class DeliveryPaymentsStore extends DeliveryPaymentsPort{
 async collectCourierCashInTx(transaction:unknown,u:Principal,input:{
  entregaId:string;cuentaId:string;monto:string
 }):Promise<{pagoId:string;cuentaId:string;monto:string}>{
  const tx=transaction as Tx,amount=money(input.monto);
  if(amount.lte(0))throw new BadRequestException('Cobro debe ser positivo');
  await tx.$queryRaw`SELECT "id" FROM "Cuenta" WHERE "id"=${input.cuentaId} FOR UPDATE`;
  const account=await tx.cuenta.findUnique({where:{id:input.cuentaId},include:{orden:{
   include:{sucursal:{include:{configuracionSucursalesComoSucursal:true}},entregasComoOrden:true}}}});
  if(!account)throw new NotFoundException('Cuenta inexistente');
  const delivery=account.orden.entregasComoOrden;
  if(!delivery||delivery.id!==input.entregaId||delivery.canalExternoId)
   throw new ConflictException('Cuenta no corresponde a delivery con cobro propio');
  if(!delivery.repartidorId||!['EN_REPARTO','ENTREGADA'].includes(delivery.estado))
   throw new ConflictException('Entrega sin repartidor o estado válido para cobrar');
  if(delivery.repartidorId!==u.id){
   await allowed(tx,u,account.orden.sucursalId,'delivery.payments.collect');
  }else{
   const eligible=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},
    OR:[{sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
     rolPermisosComoRol:{some:{permiso:{codigo:'delivery.courier'}}}}},
     {sucursalId:account.orden.sucursalId,rol:{activo:true,alcance:'SUCURSAL',
      rolPermisosComoRol:{some:{permiso:{codigo:'delivery.courier'}}}}},
     {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
      rolPermisosComoRol:{some:{permiso:{codigo:'delivery.manage'}}}}},
     {sucursalId:account.orden.sucursalId,rol:{activo:true,alcance:'SUCURSAL',
      rolPermisosComoRol:{some:{permiso:{codigo:'delivery.manage'}}}}}]},
    select:{id:true}});
   if(!eligible)await allowed(tx,u,account.orden.sucursalId,'delivery.payments.collect');
  }
  if(!account.orden.sucursal.activa||account.estado!=='ABIERTA'||account.orden.estado!=='ABIERTA')
   throw new ConflictException('Cuenta u orden no disponible para cobro');
  await assertFinancialPeriodOpen(tx,account.orden.sucursal);
  const pending=await tx.intentoPago.aggregate({where:{cuentaId:account.id,estado:'PENDIENTE'},
   _sum:{monto:true}});
  ensureCoverage(account.total,account.pagado.plus(pending._sum.monto??new Prisma.Decimal(0)).plus(amount));
  const payment=await tx.pago.create({data:{cuentaId:account.id,turnoId:null,
   cobradoPorId:delivery.repartidorId,metodo:'EFECTIVO',monto:amount,
   efectivoRecibido:amount,vuelto:new Prisma.Decimal(0),recibidoPorRepartidor:true,
   referencia:'DELIVERY:'+delivery.id}});
  await tx.cuenta.update({where:{id:account.id},data:{pagado:{increment:amount}}});
  return {pagoId:payment.id,cuentaId:account.id,monto:payment.monto.toFixed(2)};
 }

 async collectPlatformGrossInTx(transaction:unknown,u:Principal,input:{
  entregaId:string;cuentaId:string;monto:string;liquidacionId:string
 }):Promise<{pagoId:string;cuentaId:string;monto:string}>{
  const tx=transaction as Tx,amount=money(input.monto);
  if(amount.lte(0))throw new BadRequestException('Importe bruto debe ser positivo');
  await tx.$queryRaw`SELECT "id" FROM "Cuenta" WHERE "id"=${input.cuentaId} FOR UPDATE`;
  const account=await tx.cuenta.findUnique({where:{id:input.cuentaId},include:{orden:{
   include:{entregasComoOrden:true}}}});
  if(!account)throw new NotFoundException('Cuenta inexistente');
  if(account.orden.origen!=='PLATAFORMA'||account.orden.entregasComoOrden?.id!==input.entregaId||
     account.estado!=='ABIERTA'||account.orden.estado!=='ABIERTA')
   throw new ConflictException('Cuenta ajena a plataforma activa');
  await allowed(tx,u,account.orden.sucursalId,'delivery.platform.manage');
  const existing=await tx.pago.count({where:{cuentaId:account.id}});
  const pending=await tx.intentoPago.count({where:{cuentaId:account.id,estado:'PENDIENTE'}});
  if(existing||pending||!account.pagado.eq(0)||!account.total.eq(amount))
   throw new ConflictException('Cuenta ya cobrada, parcialmente pagada o importe bruto no coincide');
  const paid=await tx.pago.create({data:{cuentaId:account.id,metodo:'OTRO',monto:amount,
   recibidoPorRepartidor:false,turnoId:null,cobradoPorId:u.id,
   referencia:'PLATFORM_SETTLEMENT:'+input.liquidacionId}});
  await tx.cuenta.update({where:{id:account.id},data:{pagado:{increment:amount}}});
  return {pagoId:paid.id,cuentaId:account.id,monto:paid.monto.toFixed(2)};
 }
}
