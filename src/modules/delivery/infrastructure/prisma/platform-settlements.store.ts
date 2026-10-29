import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DeliveryPaymentsPort} from '../../../payments/application/ports/delivery-payments.port.js';
import {PlatformLedgerPort} from '../../../finance/application/ports/platform-ledger.port.js';
import {SettlementCommon,fmt,dec,zero} from './settlement-common.js';
import type {PlatformSettlementCreate} from '../../application/ports/delivery-settlements.port.js';
import {dateOnly} from '../../domain/settlement.policy.js';

@Injectable()
export class PlatformSettlementsStore{
 constructor(private readonly ctx:SettlementCommon,private readonly payments:DeliveryPaymentsPort,
  private readonly ledger:PlatformLedgerPort){}
 async channels(u:Principal,branch:string){
  return this.ctx.atomic(async tx=>{
   await this.ctx.branch(tx,branch);
   await this.ctx.require(tx,u,branch,'delivery.platform.manage');
   return {data:await tx.canalExterno.findMany({where:{activo:true},
    select:{id:true,codigo:true,nombre:true},orderBy:{nombre:'asc'}})};
  });
 }
 async detail(u:Principal,id:string){
  return this.ctx.atomic(async tx=>{
   const row=await tx.liquidacionCanalExterno.findUnique({where:{id},include:{
    liquidacionCanalExternoLineasComoLiquidacion:true
   }});
   if(!row?.sucursalId)throw new NotFoundException('Liquidación inexistente o sin sucursal');
   await this.ctx.require(tx,u,row.sucursalId,'delivery.platform.manage');
   return {id:row.id,sucursalId:row.sucursalId,canalId:row.canalId,
    cuentaFinancieraId:row.cuentaFinancieraId,periodoInicio:row.periodoInicio,
    periodoFin:row.periodoFin,referencia:row.referencia,
    totalBruto:fmt(row.totalBruto),totalComision:fmt(row.totalComision),
    totalNeto:fmt(row.totalNeto),recibidaEn:row.recibidaEn,
    lineas:row.liquidacionCanalExternoLineasComoLiquidacion.map(l=>({
     entregaId:l.entregaId,importeBruto:fmt(l.importeBruto),
     comision:fmt(l.comision),importeNeto:fmt(l.importeNeto)}))};
  });
 }
 async create(u:Principal,d:PlatformSettlementCreate){
  const start=dateOnly(d.periodoInicio),end=dateOnly(d.periodoFin);
  if(start>end)throw new BadRequestException('Periodo inicial posterior al final');
  return this.ctx.atomic(async tx=>{
   const branch=await this.ctx.branch(tx,d.sucursalId);
   await this.ctx.require(tx,u,d.sucursalId,'delivery.platform.manage');
   await this.ctx.require(tx,u,d.sucursalId,'finance.movements.post');
   return this.ctx.once(tx,u,'D3_PLATFORM_SETTLEMENT',d.claveOperacion,d,async()=>{
    const channel=await tx.canalExterno.findUnique({where:{id:d.canalId}});
    if(!channel?.activo)throw new NotFoundException('Canal de plataforma no disponible');
    const ids=d.lineas.map(l=>l.entregaId);
    if(new Set(ids).size!==ids.length)
     throw new BadRequestException('Entregas repetidas en liquidación');
    const shipments=await tx.entrega.findMany({where:{id:{in:ids}},include:{
     orden:{include:{cuentasComoOrden:true}}}});
    if(shipments.length!==d.lineas.length)throw new NotFoundException('Entrega inexistente');
    const indexed=new Map(shipments.map(x=>[x.id,x]));
    const localDay=(date:Date)=>new Intl.DateTimeFormat('en-CA',{
     timeZone:branch.zonaHoraria,year:'numeric',month:'2-digit',day:'2-digit'
    }).format(date);
    let gross=zero(),commission=zero();
    const lines=d.lineas.map(l=>{
     const sh=indexed.get(l.entregaId);
     if(!sh||sh.orden.sucursalId!==d.sucursalId||sh.canalExternoId!==d.canalId||
        sh.estado!=='ENTREGADA'||!sh.entregadaEn||sh.orden.origen!=='PLATAFORMA')
      throw new ConflictException('Entrega ajena, no entregada o de otra sucursal');
     const day=localDay(sh.entregadaEn);
     if(day<d.periodoInicio||day>d.periodoFin)
      throw new ConflictException('Entrega fuera del periodo de liquidación');
     if(sh.orden.cuentasComoOrden.length!==1||
        sh.orden.cuentasComoOrden[0].id!==l.cuentaId)
      throw new ConflictException('Plataforma requiere una cuenta única por orden');
     const amount=dec(l.importeBruto),fee=dec(l.comision);
     if(amount.lte(0)||fee.lt(0)||fee.gte(amount))
      throw new BadRequestException('Comisión fuera del rango del bruto');
     gross=gross.plus(amount);commission=commission.plus(fee);
     return {entregaId:sh.id,cuentaId:l.cuentaId,
      importeBruto:amount,comision:fee,importeNeto:amount.minus(fee)};
    });
    const net=gross.minus(commission);
    if(net.lte(0))throw new ConflictException('Importe neto inválido');
    if(await tx.liquidacionCanalExternoLinea.count({where:{entregaId:{in:ids}}}))
     throw new ConflictException('Una entrega de plataforma ya fue liquidada');
    const bank=await tx.cuentaFinanciera.findUnique({where:{id:d.cuentaFinancieraId}});
    if(!bank?.activa||bank.sucursalId!==d.sucursalId||
      bank.moneda!==(branch.configuracionSucursalesComoSucursal?.moneda??'GTQ'))
     throw new ConflictException('Cuenta financiera no pertenece a la sucursal/moneda');
    const row=await tx.liquidacionCanalExterno.create({data:{
     sucursalId:d.sucursalId,canalId:d.canalId,cuentaFinancieraId:d.cuentaFinancieraId,
     periodoInicio:start,periodoFin:end,referencia:d.referencia.trim(),
     totalBruto:gross,totalComision:commission,totalNeto:net,recibidaEn:new Date(),
     liquidacionCanalExternoLineasComoLiquidacion:{create:lines.map(l=>({
      entregaId:l.entregaId,importeBruto:l.importeBruto,
      comision:l.comision,importeNeto:l.importeNeto
     }))}
    }});
    for(const l of lines){
     // PAY-A owns gross recognition; rejects previously paid/split accounts.
     await this.payments.collectPlatformGrossInTx(tx,u,{
      entregaId:l.entregaId,cuentaId:l.cuentaId,monto:fmt(l.importeBruto),liquidacionId:row.id
     });
    }
    // FIN-A posts only the NET bank receipt; never the gross payment again.
    const posting=await this.ledger.postNetInTx(tx,u,{
     sucursalId:d.sucursalId,cuentaFinancieraId:d.cuentaFinancieraId,
     liquidacionId:row.id,monto:fmt(net)
    });
    await this.ctx.audit(tx,u,d.sucursalId,'PLATFORM_SETTLEMENT_RECEIVED',
     'LiquidacionCanalExterno',row.id,{
      canalId:d.canalId,cuentaFinancieraId:d.cuentaFinancieraId,
      totalBruto:fmt(gross),totalComision:fmt(commission),totalNeto:fmt(net),
      movimientoFinancieroId:posting.movimientoId});
    return {id:row.id,totalBruto:fmt(gross),totalComision:fmt(commission),
     totalNeto:fmt(net),movimientoFinancieroId:posting.movimientoId};
   });
  });
 }
}
