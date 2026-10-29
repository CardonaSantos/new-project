
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {money,formatted,ensureCoverage} from '../../domain/payment.policy.js';
import {allowed,audit,orderForAccount,runOnce,txSerializable,type Tx} from './payment-shared.js';
import {CashStore} from './cash.store.js';
import {postVerifiedExternalMovement} from '../../../finance/infrastructure/prisma/finance-posting.js';
import type {CollectDto,ConfirmAttemptDto,RefundDto,SplitDto,EqualSplitDto,PageDto} from '../../presentation/http/dto/payments.dto.js';

@Injectable()
export class PaymentsStore{
 constructor(private readonly db:PrismaService,private readonly cash:CashStore){}
 async account(u:Principal,id:string){
  return txSerializable(this.db,async tx=>{
   const account=await orderForAccount(tx,id);
   await allowed(tx,u,account.orden.sucursalId,'payments.read');
   const [payments,pending,sale,lines]=await Promise.all([
    tx.pago.findMany({where:{cuentaId:id},include:{reembolsoPagosComoPago:true},
     orderBy:{cobradoEn:'asc'}}),
    tx.intentoPago.findMany({where:{cuentaId:id},orderBy:{creadoEn:'desc'}}),
    tx.venta.findUnique({where:{cuentaId:id},include:{ventaLineasComoVenta:true}}),
    tx.cuentaLinea.findMany({where:{cuentaId:id},include:{ordenLinea:true}})]);
   const refunded=payments.reduce((sum,p)=>sum.plus(p.reembolsoPagosComoPago.reduce(
    (s,r)=>s.plus(r.monto),new Prisma.Decimal(0))),new Prisma.Decimal(0));
   return {id:account.id,ordenId:account.ordenId,sucursalId:account.orden.sucursalId,
    estado:account.estado,total:formatted(account.total),pagado:formatted(account.pagado),
    saldo:formatted(Prisma.Decimal.max(0,account.total.minus(account.pagado))),
    reembolsado:formatted(refunded),netoRecibido:formatted(account.pagado.minus(refunded)),
    lineas:lines,pagos:payments,intentos:pending,venta:sale};
  });
 }
 async accounts(u:Principal,orderId:string){
  return txSerializable(this.db,async tx=>{
   const order=await tx.orden.findUnique({where:{id:orderId}});
   if(!order)throw new NotFoundException('Orden inexistente');
   await allowed(tx,u,order.sucursalId,'payments.read');
   return tx.cuenta.findMany({where:{ordenId:order.id},
    include:{cuentaLineasComoCuenta:{include:{ordenLinea:true}}},
    orderBy:{abiertaEn:'asc'}});
  });
 }
 private async record(tx:Tx,u:Principal,accountId:string,turnoId:string,branchId:string,
  entry:{metodo:'EFECTIVO'|'TARJETA'|'TRANSFERENCIA'|'OTRO';monto:string;efectivoRecibido?:string;referencia?:string;
   codigoAutorizacion?:string;terminalReferencia?:string},attemptId?:string){
  const amount=money(entry.monto);
  const received=entry.metodo==='EFECTIVO'?money(entry.efectivoRecibido??entry.monto):null;
  if(received&&received.lt(amount))throw new BadRequestException('Efectivo recibido menor que cobro');
  if(entry.metodo!=='EFECTIVO'&&entry.efectivoRecibido!==undefined)
   throw new BadRequestException('efectivoRecibido solo aplica a efectivo');
  const pay=await tx.pago.create({data:{cuentaId:accountId,turnoId,cobradoPorId:u.id,
   metodo:entry.metodo,monto:amount,efectivoRecibido:received,
   vuelto:received?.minus(amount)??null,referencia:entry.referencia?.trim()??null,
   codigoAutorizacion:entry.codigoAutorizacion?.trim()??null,
   terminalReferencia:entry.terminalReferencia?.trim()??null,
   ...(attemptId?{intentoId:attemptId}:{})}});
  if(entry.metodo==='EFECTIVO')await tx.movimientoCaja.create({data:{
   turnoId,tipo:'INGRESO',monto:amount,motivo:'Cobro de cuenta',pagoId:pay.id,usuarioId:u.id}});
  else{
   // Configured once by finance; never prompt cashiers or guess a destination bank.
   const route=await tx.rutaFinanciera.findUnique({
    where:{sucursalId_metodo:{sucursalId:branchId,metodo:entry.metodo}},
    include:{cuentaFinanciera:true}});
   const verified=(entry.metodo==='TARJETA'&&!!entry.codigoAutorizacion?.trim())||
    (entry.metodo==='TRANSFERENCIA'&&!!attemptId&&!!entry.referencia?.trim())||
    (entry.metodo==='OTRO'&&!!entry.referencia?.trim());
   if(route?.activa&&route.cuentaFinanciera.activa&&
    route.cuentaFinanciera.sucursalId===branchId&&
    route.cuentaFinanciera.tipo!=='TARJETA_EMPRESA'&&verified){
    const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:branchId}});
    if(route.cuentaFinanciera.moneda===(config?.moneda??'GTQ')){
     const posting=await postVerifiedExternalMovement(tx,{
      sucursalId:branchId,cuentaId:route.cuentaFinancieraId,
      referenciaTipo:'PAGO',referenciaId:pay.id,monto:amount,
      descripcion:'Cobro externo PAY-A: '+entry.metodo
     });
     await audit(tx,u,branchId,'FIN_AUTO_RECEIPT_POSTED','MovimientoFinanciero',posting.id,
      {pagoId:pay.id,metodo:entry.metodo});
    }
   }
  }
  await tx.cuenta.update({where:{id:accountId},data:{pagado:{increment:amount}}});
  return pay;
 }
 private async settleTx(tx:Tx,u:Principal,orderId:string){
  const order=await tx.orden.findUnique({where:{id:orderId}});
  if(!order)throw new NotFoundException('Orden inexistente');
  if(order.estado==='CERRADA')return {orderId,closed:true};
  if(order.estado!=='ABIERTA')throw new ConflictException('Orden no está abierta');
  const lines=await tx.ordenLinea.findMany({where:{ordenId:orderId,canceladaEn:null}});
  if(!lines.length||lines.some(x=>x.cantidadEnviada.lt(x.cantidad)))
   throw new ConflictException('Hay productos sin enviar');
  if(await tx.comanda.count({where:{ordenId:orderId,estado:{in:['PENDIENTE','PREPARANDO']}}}))
   throw new ConflictException('Hay comandas pendientes');
  const accounts=await tx.cuenta.findMany({where:{ordenId:orderId},
   include:{cuentaLineasComoCuenta:{include:{ordenLinea:true}}}});
  if(!accounts.length||accounts.some(x=>x.pagado.lt(x.total)||x.pagado.gt(x.total)))
   throw new ConflictException('Todas las cuentas deben estar exactamente pagadas');
  const now=new Date();
  for(const account of accounts){
   // Pending bank confirmations cannot survive a fully settled order.
   await tx.intentoPago.updateMany({where:{cuentaId:account.id,estado:'PENDIENTE'},
    data:{estado:'CANCELADO'}});
   const net=account.cuentaLineasComoCuenta.reduce((s,l)=>s.plus(l.importeAsignado),new Prisma.Decimal(0));
   if(!net.eq(account.total))throw new ConflictException('Asignaciones de cuenta no concilian');
   const existing=await tx.venta.findUnique({where:{cuentaId:account.id}});
   if(!existing){
    const sale=await tx.venta.create({data:{numero:'VT-'+randomUUID().slice(0,16),
     cuentaId:account.id,sucursalId:order.sucursalId,clienteId:order.clienteId,
     total:account.total,descuentoTotal:account.cuentaLineasComoCuenta.reduce(
      (s,l)=>s.plus(l.ordenLinea.descuento.mul(l.cantidadAsignada).div(l.ordenLinea.cantidad)),
      new Prisma.Decimal(0)).toDecimalPlaces(2),
     ventaLineasComoVenta:{create:account.cuentaLineasComoCuenta.filter(l=>l.cantidadAsignada.gt(0)).map(l=>({
      ordenLineaId:l.ordenLineaId,descripcion:l.ordenLinea.nombreSnapshot,
      cantidad:l.cantidadAsignada,precioUnitario:l.ordenLinea.precioUnitario,
      descuento:l.ordenLinea.descuento.mul(l.cantidadAsignada).div(l.ordenLinea.cantidad)
       .toDecimalPlaces(2),subtotal:l.importeAsignado
     }))}}});
    await audit(tx,u,order.sucursalId,'SALE_RECORDED','Venta',sale.id,
     {cuentaId:account.id,total:formatted(account.total)});
   }
   await tx.cuenta.update({where:{id:account.id},data:{estado:'CERRADA',cerradaEn:now}});
  }
  await tx.orden.update({where:{id:orderId},data:{estado:'CERRADA',cerradaEn:now,
   version:{increment:1}}});
  if(order.ocupacionMesaId&&!await tx.orden.count({where:{
   ocupacionMesaId:order.ocupacionMesaId,estado:'ABIERTA'}})){
   await tx.ocupacionMesa.updateMany({where:{id:order.ocupacionMesaId,cerradaEn:null},data:{cerradaEn:now}});
   await audit(tx,u,order.sucursalId,'TABLE_RELEASED','OcupacionMesa',order.ocupacionMesaId);
  }
  await tx.eventoOrden.create({data:{ordenId:orderId,usuarioId:u.id,accion:'ORDER_CLOSED',
   detalles:{origen:'PAY_A'} as Prisma.InputJsonValue}});
  await audit(tx,u,order.sucursalId,'ORDER_CLOSED','Orden',orderId);
  return {orderId,closed:true};
 }
 private async readyToSettle(tx:Tx,orderId:string){
  const lines=await tx.ordenLinea.findMany({where:{ordenId:orderId,canceladaEn:null}});
  if(!lines.length||lines.some(l=>l.cantidadEnviada.lt(l.cantidad)))return false;
  if(await tx.comanda.count({where:{ordenId:orderId,estado:{in:['PENDIENTE','PREPARANDO']}}}))return false;
  const accounts=await tx.cuenta.findMany({where:{ordenId:orderId}});
  return accounts.length>0&&accounts.every(a=>a.pagado.eq(a.total));
 }
 async finalize(u:Principal,orderId:string){
  return txSerializable(this.db,async tx=>{
   const o=await tx.orden.findUnique({where:{id:orderId}});
   if(!o)throw new NotFoundException('Orden inexistente');
   await allowed(tx,u,o.sucursalId,'payments.collect');
   return this.settleTx(tx,u,orderId);
  });
 }
 async settle(u:Principal,orderId:string){
  const result=await txSerializable(this.db,async tx=>{
   const o=await tx.orden.findUnique({where:{id:orderId}});
   if(!o)throw new NotFoundException('Orden inexistente');
   await allowed(tx,u,o.sucursalId,'orders.manage');
   return this.settleTx(tx,u,orderId);
  });
  return result;
 }
 async collect(u:Principal,accountId:string,d:CollectDto){
  const entries=d.pagos.map(p=>({...p,monto:formatted(money(p.monto))}));
  const result=await txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,
   'PAYMENTS_COLLECT',{accountId,...d},async()=>{
   const account=await orderForAccount(tx,accountId);
   const branch=account.orden.sucursalId;
   await allowed(tx,u,branch,'payments.collect');
   if(account.orden.estado!=='ABIERTA'||account.estado!=='ABIERTA')
    throw new ConflictException('Cuenta o orden cerrada');
   const shift=await this.cash.shiftTx(tx,u,d.turnoId,'payments.collect');
   if(shift.caja.sucursalId!==branch)throw new ConflictException('Turno de otra sucursal');
   const total=entries.reduce((s,p)=>s.plus(money(p.monto)),new Prisma.Decimal(0));
   const existingPending=await tx.intentoPago.findMany({where:{cuentaId:accountId,estado:'PENDIENTE'}});
   const reserved=existingPending.reduce((s,p)=>s.plus(p.monto),new Prisma.Decimal(0));
   ensureCoverage(account.total,account.pagado.plus(reserved).plus(total));
   const pagos:string[]=[],intentos:string[]=[];
   for(let i=0;i<entries.length;i++){
    const p=entries[i];
    if(p.metodo==='TRANSFERENCIA'){
     if(!p.referencia?.trim())throw new BadRequestException('Transferencia exige referencia bancaria');
     const attempt=await tx.intentoPago.create({data:{cuentaId:account.id,
      metodo:p.metodo,monto:money(p.monto),estado:'PENDIENTE',
      claveIdempotencia:d.claveOperacion+':'+i,referenciaExterna:p.referencia.trim()}});
     intentos.push(attempt.id);
    }else{
     if(p.metodo==='TARJETA'&&!p.codigoAutorizacion?.trim())
      throw new BadRequestException('Tarjeta externa exige código de autorización confirmado');
     if(p.metodo==='OTRO'&&!p.referencia?.trim())
      throw new BadRequestException('Otro método exige referencia');
     const paid=await this.record(tx,u,accountId,d.turnoId,branch,p);
     pagos.push(paid.id);
    }
   }
   await audit(tx,u,branch,'PAYMENTS_COLLECTED','Cuenta',accountId,{
    pagos:pagos.length,intentos:intentos.length});
   if(await this.readyToSettle(tx,account.ordenId))
    await this.settleTx(tx,u,account.ordenId);
   return {accountId,pagoIds:pagos,intentoIds:intentos};
  }));
  return {...result,cuenta:await this.account(u,accountId)};
 }
 async confirm(u:Principal,attemptId:string,d:ConfirmAttemptDto){
  const result=await txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,
   'PAYMENT_ATTEMPT_CONFIRM',{attemptId,...d},async()=>{
   const attempt=await tx.intentoPago.findUnique({where:{id:attemptId},
    include:{cuenta:{include:{orden:true}}}});
   if(!attempt)throw new NotFoundException('Intento inexistente');
   await allowed(tx,u,attempt.cuenta.orden.sucursalId,'payments.verify');
   if(attempt.estado!=='PENDIENTE')throw new ConflictException('Intento no pendiente');
   if(attempt.cuenta.estado!=='ABIERTA'||attempt.cuenta.orden.estado!=='ABIERTA')
    throw new ConflictException('Cuenta u orden no activa');
   const shift=await this.cash.shiftTx(tx,u,d.turnoId,'payments.collect');
   if(shift.caja.sucursalId!==attempt.cuenta.orden.sucursalId)throw new ConflictException('Turno de otra sucursal');
   ensureCoverage(attempt.cuenta.total,attempt.cuenta.pagado.plus(attempt.monto));
   await tx.intentoPago.update({where:{id:attemptId},data:{estado:'CONFIRMADO'}});
   const payment=await this.record(tx,u,attempt.cuentaId,d.turnoId,attempt.cuenta.orden.sucursalId,{
    metodo:attempt.metodo,monto:formatted(attempt.monto),
    referencia:attempt.referenciaExterna??undefined,
    codigoAutorizacion:attempt.codigoAutorizacion??undefined,
    terminalReferencia:attempt.terminalReferencia??undefined
   },attemptId);
   await audit(tx,u,attempt.cuenta.orden.sucursalId,'PAYMENT_VERIFIED','Pago',payment.id,{
    intentoId:attemptId,motivo:d.motivo.trim()});
   if(await this.readyToSettle(tx,attempt.cuenta.ordenId))
    await this.settleTx(tx,u,attempt.cuenta.ordenId);
   return {cuentaId:attempt.cuentaId,pagoId:payment.id};
  }));
  return {...result,cuenta:await this.account(u,result.cuentaId)};
 }
 async cancelAttempt(u:Principal,attemptId:string,
  d:{motivo:string;claveOperacion:string}){
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,
   'PAYMENT_ATTEMPT_CANCEL',{attemptId,...d},async()=>{
    const attempt=await tx.intentoPago.findUnique({where:{id:attemptId},
     include:{cuenta:{include:{orden:true}}}});
    if(!attempt)throw new NotFoundException('Intento inexistente');
    await allowed(tx,u,attempt.cuenta.orden.sucursalId,'payments.verify');
    if(attempt.estado!=='PENDIENTE')throw new ConflictException('Intento no pendiente');
    await tx.intentoPago.update({where:{id:attemptId},data:{estado:'CANCELADO'}});
    await audit(tx,u,attempt.cuenta.orden.sucursalId,'PAYMENT_ATTEMPT_CANCELLED',
     'IntentoPago',attemptId,{motivo:d.motivo.trim()});
    return {attemptId,estado:'CANCELADO'};
   }));
 }
 async refund(u:Principal,pagoId:string,d:RefundDto){
  const amount=money(d.monto);
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,
   'PAYMENT_REFUND',{pagoId,...d},async()=>{
   const payment=await tx.pago.findUnique({where:{id:pagoId},
    include:{cuenta:{include:{orden:true}},reembolsoPagosComoPago:true}});
   if(!payment)throw new NotFoundException('Pago inexistente');
   const branch=payment.cuenta.orden.sucursalId;
   await allowed(tx,u,branch,'payments.refund');
   const prior=payment.reembolsoPagosComoPago.reduce((s,r)=>s.plus(r.monto),new Prisma.Decimal(0));
   if(amount.plus(prior).gt(payment.monto))throw new ConflictException('Reembolso excede pago disponible');
   if(payment.metodo==='EFECTIVO'&&!d.turnoId)
    throw new BadRequestException('Devolución en efectivo exige turno activo');
   if(payment.metodo!=='EFECTIVO'&&!d.referenciaExterna?.trim())
    throw new BadRequestException('Reembolso externo exige referencia verificada');
   if(d.turnoId){
    const shift=await this.cash.shiftTx(tx,u,d.turnoId,'payments.refund',false);
    if(shift.caja.sucursalId!==branch)throw new ConflictException('Turno de otra sucursal');
   }
   const refund=await tx.reembolsoPago.create({data:{pagoId,monto:amount,
    motivo:d.motivo.trim(),usuarioId:u.id,referenciaExterna:d.referenciaExterna?.trim()}});
   if(payment.metodo==='EFECTIVO'){
    const shift=await tx.turnoCaja.findUniqueOrThrow({where:{id:d.turnoId!}});
    const movements=await tx.movimientoCaja.findMany({where:{turnoId:shift.id}});
    const available=movements.reduce((s,m)=>s.plus(m.tipo==='INGRESO'?m.monto:m.monto.neg()),shift.fondoInicial);
    if(amount.gt(available))throw new ConflictException('Caja sin efectivo suficiente para reembolso');
   }
   if(payment.metodo==='EFECTIVO')await tx.movimientoCaja.create({data:{
    turnoId:d.turnoId!,tipo:'EGRESO',monto:amount,motivo:'Reembolso: '+d.motivo.trim(),
    reembolsoId:refund.id,usuarioId:u.id}});
   else{
    // Refund to the same financial account as the original confirmed receipt.
    const original=await tx.movimientoFinanciero.findFirst({
     where:{referenciaTipo:'PAGO',referenciaId:pagoId}});
    if(original){
     const posting=await postVerifiedExternalMovement(tx,{
      sucursalId:branch,cuentaId:original.cuentaId,
      referenciaTipo:'REEMBOLSO_PAGO',referenciaId:refund.id,
      monto:amount.neg(),descripcion:'Reembolso externo PAY-A'
     });
     await audit(tx,u,branch,'FIN_AUTO_REFUND_POSTED','MovimientoFinanciero',posting.id,
      {reembolsoId:refund.id,pagoId});
    }
   }
   await audit(tx,u,branch,'PAYMENT_REFUNDED','ReembolsoPago',refund.id,
    {pagoId,monto:formatted(amount),motivo:d.motivo.trim()});
   return {refundId:refund.id,pagoId,cuentaId:payment.cuentaId};
  }));
 }
 async sale(u:Principal,id:string){
  return txSerializable(this.db,async tx=>{
   const sale=await tx.venta.findUnique({where:{id},
    include:{ventaLineasComoVenta:true,cuenta:{include:{orden:{select:{
     id:true,numero:true,modalidad:true,estado:true}}}}}});
   if(!sale)throw new NotFoundException('Venta inexistente');
   await allowed(tx,u,sale.sucursalId,'sales.read');
   return sale;
  });
 }
 async paymentSummary(u:Principal,sucursalId:string){
  return txSerializable(this.db,async tx=>{
   await allowed(tx,u,sucursalId,'cash.read');
   const [collected,refunded,sales,shifts]=await Promise.all([
    tx.pago.groupBy({by:['metodo'],where:{cuenta:{orden:{sucursalId}}},
     _sum:{monto:true},_count:{_all:true}}),
    tx.reembolsoPago.aggregate({where:{pago:{cuenta:{orden:{sucursalId}}}},_sum:{monto:true}}),
    tx.venta.aggregate({where:{sucursalId},_sum:{total:true},_count:{_all:true}}),
    tx.turnoCaja.aggregate({where:{caja:{sucursalId},cerradaEn:{not:null}},
     _sum:{diferencia:true},_count:{_all:true}})
   ]);
   const gross=collected.reduce((s,x)=>s.plus(x._sum.monto??0),new Prisma.Decimal(0));
   const returns=refunded._sum.monto??new Prisma.Decimal(0);
   return {sucursalId,cobradoBruto:formatted(gross),reembolsado:formatted(returns),
    cobradoNeto:formatted(gross.minus(returns)),
    ventasInternas:formatted(sales._sum.total??new Prisma.Decimal(0)),
    cantidadVentas:sales._count._all,
    cajaDiferenciaAcumulada:formatted(shifts._sum.diferencia??new Prisma.Decimal(0)),
    turnosCerrados:shifts._count._all,
    porMetodo:collected.map(x=>({metodo:x.metodo,total:formatted(x._sum.monto??new Prisma.Decimal(0)),
     cantidad:x._count._all}))};
  });
 }
 async sales(u:Principal,q:PageDto){
  return txSerializable(this.db,async tx=>{
   await allowed(tx,u,q.sucursalId,'sales.read');
   const [data,total]=await Promise.all([
    tx.venta.findMany({where:{sucursalId:q.sucursalId},orderBy:{cerradaEn:'desc'},
     skip:(q.page-1)*q.limit,take:q.limit,include:{ventaLineasComoVenta:true}}),
    tx.venta.count({where:{sucursalId:q.sucursalId}})]);
   return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 private async replaceAccounts(tx:Tx,u:Principal,orderId:string,
  list:{nombre:string;lineas:{ordenLineaId:string;cantidadAsignada:string;importeAsignado:string}[]}[]){
  const order=await tx.orden.findUnique({where:{id:orderId}});
  if(!order||order.estado!=='ABIERTA')throw new ConflictException('Orden inexistente o cerrada');
  await allowed(tx,u,order.sucursalId,'payments.split');
  const accounts=await tx.cuenta.findMany({where:{ordenId:orderId},include:{
   pagosComoCuenta:true,intentoPagosComoCuenta:true}});
  if(accounts.length!==1||accounts[0].estado!=='ABIERTA'||
    accounts[0].pagado.gt(0)||accounts[0].pagosComoCuenta.length||
    accounts[0].intentoPagosComoCuenta.length)
   throw new ConflictException('Solo se divide cuenta principal sin pagos ni intentos');
  const lines=await tx.ordenLinea.findMany({where:{ordenId:orderId,canceladaEn:null}});
  if(!lines.length)throw new ConflictException('Orden vacía');
  const available=new Map(lines.map(l=>[l.id,l]));
  const totals=new Map<string,{quantity:Prisma.Decimal;amount:Prisma.Decimal}>();
  const seen=new Set<string>();
  for(const [index,part] of list.entries()){
   if(!part.nombre.trim())throw new BadRequestException('Cuenta sin nombre');
   if(!part.lineas.length)throw new BadRequestException('Cuenta vacía');
   for(const item of part.lineas){
    const row=available.get(item.ordenLineaId);
    if(!row)throw new ConflictException('Línea de otra orden o cancelada');
    if(seen.has(index+':'+item.ordenLineaId))throw new ConflictException('Línea repetida en una cuenta');
    seen.add(index+':'+item.ordenLineaId);
    const qty=new Prisma.Decimal(item.cantidadAsignada),amt=money(item.importeAsignado);
    if(!qty.gt(0)||qty.decimalPlaces()>3)throw new BadRequestException('Cantidad asignada inválida');
    const old=totals.get(row.id)??{quantity:new Prisma.Decimal(0),amount:new Prisma.Decimal(0)};
    totals.set(row.id,{quantity:old.quantity.plus(qty),amount:old.amount.plus(amt)});
   }
  }
  for(const l of lines){
   const t=totals.get(l.id);
   if(!t||!t.quantity.eq(l.cantidad)||!t.amount.eq(l.subtotal.minus(l.descuento)))
    throw new ConflictException('La suma de asignaciones no concilia con la línea '+l.id);
  }
  await tx.cuentaLinea.deleteMany({where:{cuentaId:accounts[0].id}});
  await tx.cuenta.delete({where:{id:accounts[0].id}});
  const result=[];
  for(const part of list){
   const total=part.lineas.reduce((sum,l)=>sum.plus(money(l.importeAsignado)),new Prisma.Decimal(0));
   const account=await tx.cuenta.create({data:{ordenId:orderId,nombre:part.nombre.trim(),total,
    cuentaLineasComoCuenta:{create:part.lineas.map(l=>({
     ordenLineaId:l.ordenLineaId,cantidadAsignada:new Prisma.Decimal(l.cantidadAsignada),
     importeAsignado:money(l.importeAsignado)}))}}});
   result.push(account.id);
  }
  await audit(tx,u,order.sucursalId,'ACCOUNTS_SPLIT','Orden',orderId,{cuentas:result.length});
  return {orderId,cuentaIds:result};
 }
 async split(u:Principal,orderId:string,d:SplitDto){
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,'ACCOUNTS_SPLIT',
   {orderId,...d},()=>this.replaceAccounts(tx,u,orderId,d.cuentas)));
 }
 async splitEqual(u:Principal,orderId:string,d:EqualSplitDto){
  return txSerializable(this.db,tx=>runOnce(tx,u,d.claveOperacion,'ACCOUNTS_SPLIT_EQUAL',
   {orderId,...d},async()=>{
    const lines=await tx.ordenLinea.findMany({where:{ordenId:orderId,canceladaEn:null}});
    const accounts=Array.from({length:d.personas},(_,i)=>({nombre:'Persona '+(i+1),
     lineas:[] as {ordenLineaId:string;cantidadAsignada:string;importeAsignado:string}[]}));
    for(const line of lines){
     const millis=line.cantidad.mul(1000).toNumber(),
      cents=line.subtotal.minus(line.descuento).mul(100).toNumber();
     if(millis<d.personas||cents<d.personas)
      throw new ConflictException('Cantidad o importe demasiado pequeño para dividir entre personas');
     for(let i=0;i<d.personas;i++){
      const qty=Math.floor(millis/d.personas)+(i<millis%d.personas?1:0);
      const cash=Math.floor(cents/d.personas)+(i<cents%d.personas?1:0);
      accounts[i].lineas.push({ordenLineaId:line.id,
       cantidadAsignada:new Prisma.Decimal(qty).div(1000).toFixed(3),
       importeAsignado:new Prisma.Decimal(cash).div(100).toFixed(2)});
     }
    }
    return this.replaceAccounts(tx,u,orderId,accounts);
   }));
 }
}
