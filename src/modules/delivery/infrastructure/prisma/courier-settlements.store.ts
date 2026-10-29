import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import {DeliveryPaymentsPort} from '../../../payments/application/ports/delivery-payments.port.js';
import {SettlementCommon,fmt,dec,zero} from './settlement-common.js';
import type {CourierCashInput,CourierPending,CourierSettlementCreate,CourierSettlementClose,CourierDiscrepancy}
 from '../../application/ports/delivery-settlements.port.js';
import {ensureExactCash} from '../../domain/settlement.policy.js';
@Injectable()
export class CourierSettlementsStore{
 constructor(private readonly ctx:SettlementCommon,private readonly payments:DeliveryPaymentsPort,
  private readonly cashStore:CashStore){}
 async cash(u:Principal,entregaId:string,d:CourierCashInput){
  return this.ctx.atomic(async tx=>{
   const shipment=await tx.entrega.findUnique({where:{id:entregaId},include:{orden:true}});
   if(!shipment)throw new NotFoundException('Entrega inexistente');
   await this.ctx.branch(tx,shipment.orden.sucursalId);
   if(shipment.repartidorId!==u.id)
    await this.ctx.require(tx,u,shipment.orden.sucursalId,'delivery.payments.collect');
   return this.ctx.once(tx,u,'D3_COURIER_CASH',d.claveOperacion,{entregaId,...d},async()=>{
    const p=await this.payments.collectCourierCashInTx(tx,u,{
     entregaId,cuentaId:d.cuentaId,monto:d.monto
    });
    await this.ctx.audit(tx,u,shipment.orden.sucursalId,'COURIER_CASH_COLLECTED','Pago',p.pagoId,
     {entregaId,cuentaId:p.cuentaId,monto:p.monto});
    return p;
   });
  });
 }
 async pending(u:Principal,q:CourierPending){
  return this.ctx.atomic(async tx=>{
   await this.ctx.branch(tx,q.sucursalId);
   const manage=await this.ctx.has(tx,u,q.sucursalId,'delivery.settlements.read')||
    await this.ctx.has(tx,u,q.sucursalId,'delivery.settlements.manage');
   if(!manage&&!await this.ctx.has(tx,u,q.sucursalId,'delivery.courier'))
    throw new ForbiddenException('Sin permiso de liquidaciones');
   const courierId=manage?q.repartidorId:u.id;
   const where:Prisma.PagoWhereInput={
    metodo:'EFECTIVO',recibidoPorRepartidor:true,turnoId:null,
    liquidacionRepartidorLineasComoPago:{is:null},reembolsoPagosComoPago:{none:{}},
    ...(courierId?{cobradoPorId:courierId}:{}),
    cuenta:{orden:{sucursalId:q.sucursalId,
     entregasComoOrden:{is:{estado:'ENTREGADA',
      ...(courierId?{repartidorId:courierId}:{})}}}}
   };
   const [rows,total]=await Promise.all([
    tx.pago.findMany({where,orderBy:{cobradoEn:'asc'},skip:(q.page-1)*q.limit,take:q.limit,
     select:{id:true,cuentaId:true,monto:true,cobradoEn:true,cobradoPorId:true,
      cuenta:{select:{orden:{select:{entregasComoOrden:{select:{id:true}}}}}}}}),
    tx.pago.count({where})
   ]);
   return {data:rows.map(p=>({pagoId:p.id,cuentaId:p.cuentaId,
    entregaId:p.cuenta.orden.entregasComoOrden?.id,repartidorId:p.cobradoPorId,
    monto:fmt(p.monto),cobradoEn:p.cobradoEn})),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async create(u:Principal,d:CourierSettlementCreate){
  return this.ctx.atomic(async tx=>{
   await this.ctx.branch(tx,d.sucursalId);
   await this.ctx.require(tx,u,d.sucursalId,'delivery.settlements.manage');
   return this.ctx.once(tx,u,'D3_COURIER_SETTLEMENT',d.claveOperacion,d,async()=>{
    if(new Set(d.pagoIds).size!==d.pagoIds.length)
     throw new BadRequestException('Pagos repetidos');
    const payments=await tx.pago.findMany({where:{id:{in:d.pagoIds}},include:{
     liquidacionRepartidorLineasComoPago:true,reembolsoPagosComoPago:true,
     cuenta:{include:{orden:{include:{entregasComoOrden:true}}}}
    }});
    if(payments.length!==d.pagoIds.length)throw new NotFoundException('Pago inexistente');
    const lines=payments.map(p=>{
     const shipment=p.cuenta.orden.entregasComoOrden;
     if(!shipment||shipment.estado!=='ENTREGADA'||shipment.canalExternoId||
       shipment.repartidorId!==d.repartidorId||p.cobradoPorId!==d.repartidorId||
       p.cuenta.orden.sucursalId!==d.sucursalId||p.metodo!=='EFECTIVO'||
       !p.recibidoPorRepartidor||p.turnoId!==null||p.liquidacionRepartidorLineasComoPago||
       p.reembolsoPagosComoPago.length)
      throw new ConflictException('Pago no elegible o liquidado anteriormente');
     return {pagoId:p.id,entregaId:shipment.id,monto:p.monto};
    });
    const sum=lines.reduce((v,l)=>v.plus(l.monto),zero());
    if(sum.lte(0))throw new ConflictException('Importe esperado debe ser positivo');
    const row=await tx.liquidacionRepartidor.create({data:{
     sucursalId:d.sucursalId,repartidorId:d.repartidorId,
     estado:'ABIERTA',totalEsperado:sum,totalEntregado:zero(),
     liquidacionRepartidorLineasComoLiquidacion:{create:lines}
    }});
    await this.ctx.audit(tx,u,d.sucursalId,'COURIER_SETTLEMENT_CREATED','LiquidacionRepartidor',row.id,
     {repartidorId:d.repartidorId,totalEsperado:fmt(sum),pagos:lines.length});
    return {id:row.id,estado:'ABIERTA',totalEsperado:fmt(sum)};
   });
  });
 }
 async discrepancy(u:Principal,id:string,d:CourierDiscrepancy){
  return this.ctx.atomic(async tx=>{
   const row=await tx.liquidacionRepartidor.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Liquidación inexistente');
   await this.ctx.require(tx,u,row.sucursalId,'delivery.settlements.manage');
   return this.ctx.once(tx,u,'D3_COURIER_DISCREPANCY',d.claveOperacion,{id,...d},async()=>{
    const current=await tx.liquidacionRepartidor.findUnique({where:{id}});
    if(!current||current.estado!=='ABIERTA')
     throw new ConflictException('La liquidación debe seguir abierta');
    const declared=dec(d.montoDeclarado);
    const difference=current.totalEsperado.minus(declared);
    if(difference.eq(0))throw new BadRequestException('No existe una diferencia por documentar');
    await this.ctx.audit(tx,u,current.sucursalId,'COURIER_CASH_DISCREPANCY',
     'LiquidacionRepartidor',id,{
      totalEsperado:fmt(current.totalEsperado),totalDeclarado:fmt(declared),
      diferencia:fmt(difference),motivo:d.motivo.trim()
     });
    return {id,estado:'ABIERTA',totalEsperado:fmt(current.totalEsperado),
     totalDeclarado:fmt(declared),diferencia:fmt(difference)};
   });
  });
 }
 async detail(u:Principal,id:string){
  return this.ctx.atomic(async tx=>{
   const row=await tx.liquidacionRepartidor.findUnique({where:{id},include:{
    liquidacionRepartidorLineasComoLiquidacion:true,movimientoCajasComoLiquidacionRepartidor:true
   }});
   if(!row)throw new NotFoundException('Liquidación inexistente');
   if(!await this.ctx.has(tx,u,row.sucursalId,'delivery.settlements.read')&&
      !await this.ctx.has(tx,u,row.sucursalId,'delivery.settlements.manage')&&
      !(row.repartidorId===u.id&&await this.ctx.has(tx,u,row.sucursalId,'delivery.courier')))
    throw new ForbiddenException('Sin permiso para ver liquidación');
   return {id:row.id,estado:row.estado,sucursalId:row.sucursalId,
    repartidorId:row.repartidorId,turnoCajaId:row.turnoCajaId,
    totalEsperado:fmt(row.totalEsperado),totalEntregado:fmt(row.totalEntregado),
    cerradaEn:row.cerradaEn,movimientoCajaId:row.movimientoCajasComoLiquidacionRepartidor?.id??null,
    lineas:row.liquidacionRepartidorLineasComoLiquidacion.map(l=>({
     pagoId:l.pagoId,entregaId:l.entregaId,monto:fmt(l.monto)}))};
  });
 }
 async close(u:Principal,id:string,d:CourierSettlementClose){
  const result=await this.ctx.atomic(async tx=>{
   const row=await tx.liquidacionRepartidor.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Liquidación inexistente');
   await this.ctx.require(tx,u,row.sucursalId,'delivery.settlements.manage');
   await this.ctx.require(tx,u,row.sucursalId,'cash.manage');
   // A replay remains idempotent even if its original shift has since closed.
   return this.ctx.once(tx,u,'D3_COURIER_CLOSE',d.claveOperacion,{id,...d},async()=>{
    // PAY-A/Cash validates the active shift and FIN-A operating day on NEW deposits only.
    const shift=await this.cashStore.shiftTx(tx,u,d.turnoCajaId,'cash.manage',false);
    if(shift.caja.sucursalId!==row.sucursalId)
     throw new ConflictException('Turno de otra sucursal');
    await tx.$queryRaw`SELECT "id" FROM "LiquidacionRepartidor" WHERE "id"=${id} FOR UPDATE`;
    const current=await tx.liquidacionRepartidor.findUnique({where:{id}});
    if(!current||current.estado!=='ABIERTA')throw new ConflictException('Liquidación ya cerrada');
    if(current.totalEsperado.lte(0))throw new ConflictException('Sin efectivo por liquidar');
    const actual=dec(d.totalEntregado);
    ensureExactCash(fmt(current.totalEsperado),fmt(actual));
    await tx.liquidacionRepartidor.update({where:{id},data:{
     estado:'CERRADA',turnoCajaId:d.turnoCajaId,totalEntregado:actual,cerradaEn:new Date()
    }});
    const movement=await tx.movimientoCaja.create({data:{
     turnoId:d.turnoCajaId,tipo:'INGRESO',monto:actual,
     motivo:'Efectivo entregado por repartidor',liquidacionRepartidorId:id,usuarioId:u.id}});
    await this.ctx.audit(tx,u,row.sucursalId,'COURIER_SETTLEMENT_CLOSED','LiquidacionRepartidor',id,
     {turnoCajaId:d.turnoCajaId,totalEntregado:fmt(actual),movimientoCajaId:movement.id});
    return {id,estado:'CERRADA',movimientoCajaId:movement.id,totalEntregado:fmt(actual)};
   });
  });
  return {...result,detalle:await this.detail(u,id)};
 }
}
