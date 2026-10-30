import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {operationalDate} from '../../../payments/domain/payment.policy.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ReportingPort} from '../../application/ports/reporting.port.js';
import type {OperationalQuery,ReportingQuery,TicketQuery} from '../../application/contracts/reporting.types.js';
import {resolvePeriod,ensurePage} from '../../domain/report-period.policy.js';

type Tx=Prisma.TransactionClient;
type RawDay={dia:string;total:string;descuentos?:string;cuentas?:number;tickets?:number};
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);
const zero='0.00';
@Injectable()
export class ReportingStore extends ReportingPort{
 constructor(private readonly db:PrismaService){super();}
 private read<T>(call:(tx:Tx)=>Promise<T>):Promise<T>{
  return this.db.$transaction(call,{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20000});
 }
 private async access(tx:Tx,u:Principal,branch:string){
  const [b,role]=await Promise.all([
   tx.sucursal.findUnique({where:{id:branch},include:{configuracionSucursalesComoSucursal:true}}),
   tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
    {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:'reports.read'}}}}},
    {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:'reports.read'}}}}}
   ]},select:{id:true}})
  ]);
  if(!role)throw new ForbiddenException('Sin permiso reports.read en esta sucursal');
  if(!b?.activa)throw new NotFoundException('Sucursal no disponible');
  return {id:b.id,nombre:b.nombre,codigo:b.codigo,
   zonaHoraria:b.zonaHoraria,corte:b.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00',
   moneda:b.configuracionSucursalesComoSucursal?.moneda??'GTQ'};
 }
 private period(q:ReportingQuery,branch:{zonaHoraria:string;corte:string}){
  const defaultDay=operationalDate(new Date(),branch.zonaHoraria,branch.corte).toISOString().slice(0,10);
  const days=resolvePeriod(q,defaultDay);
  const first=financialBusinessWindow(days.desde,branch.zonaHoraria,branch.corte);
  const last=financialBusinessWindow(days.hasta,branch.zonaHoraria,branch.corte);
  return {...days,from:first.from,to:last.to};
 }
 async operational(u:Principal,q:OperationalQuery){
  return this.read(async tx=>{
   const b=await this.access(tx,u,q.sucursalId);
   const now=new Date();
   const upcoming=new Date(now.getTime()+120*60000);
   const [openOrders,pendingKitchen,inProgressKitchen,occupiedTables,
    inDelivery,confirmedBookings,pendingBookings,openShifts]=await Promise.all([
    tx.orden.count({where:{sucursalId:b.id,estado:'ABIERTA'}}),
    tx.comanda.count({where:{orden:{sucursalId:b.id},estado:'PENDIENTE'}}),
    tx.comanda.count({where:{orden:{sucursalId:b.id},estado:'PREPARANDO'}}),
    tx.ocupacionMesa.count({where:{mesa:{sala:{sucursalId:b.id}},cerradaEn:null}}),
    tx.entrega.count({where:{orden:{sucursalId:b.id},estado:'EN_REPARTO'}}),
    tx.reserva.count({where:{sucursalId:b.id,estado:'CONFIRMADA',inicio:{gte:now,lt:upcoming}}}),
    tx.reserva.count({where:{sucursalId:b.id,estado:'PENDIENTE',inicio:{gte:now,lt:upcoming}}}),
    tx.turnoCaja.count({where:{caja:{sucursalId:b.id},cerradaEn:null}})
   ]);
   return {sucursal:b,generatedAt:now.toISOString(),freshness:'LIVE_READ',
    horizonMinutes:120,
    kpis:{pedidosAbiertos:openOrders,comandasPendientes:pendingKitchen,
     comandasPreparando:inProgressKitchen,mesasOcupadas:occupiedTables,
     entregasEnReparto:inDelivery,reservasConfirmadasProximas:confirmedBookings,
     reservasPendientesProximas:pendingBookings,turnosCajaAbiertos:openShifts}};
  });
 }
 async overview(u:Principal,q:ReportingQuery){
  return this.read(async tx=>{
   const b=await this.access(tx,u,q.sucursalId);
   const p=this.period(q,b),span={gte:p.from,lt:p.to};
   // Each event family has its own recognition date. Never add sales, payments,
   // financial postings and cash movements into one fictitious income figure.
   const [sales,paid,refunded,expenses,ticketsCount,cashClosed,cashOpen,
    salesDays,paymentDays,refundDays,expenseDays]=await Promise.all([
    tx.venta.aggregate({where:{sucursalId:b.id,cerradaEn:span},
     _sum:{total:true,descuentoTotal:true},_count:{id:true}}),
    tx.pago.aggregate({where:{cobradoEn:span,cuenta:{orden:{sucursalId:b.id}}},
     _sum:{monto:true},_count:{id:true}}),
    tx.reembolsoPago.aggregate({where:{creadoEn:span,pago:{cuenta:{orden:{sucursalId:b.id}}}},
     _sum:{monto:true},_count:{id:true}}),
    tx.gastoOperativo.aggregate({where:{sucursalId:b.id,registradoEn:span},
     _sum:{monto:true},_count:{id:true}}),
    tx.$queryRaw<Array<{total:number}>>`
      SELECT COUNT(DISTINCT c."ordenId")::int AS total
      FROM "Venta" v JOIN "Cuenta" c ON c.id=v."cuentaId"
      WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${p.from} AND v."cerradaEn"<${p.to}`,
    tx.turnoCaja.aggregate({where:{caja:{sucursalId:b.id},fechaOperativa:{
      gte:new Date(p.desde+'T00:00:00Z'),lte:new Date(p.hasta+'T00:00:00Z')},cerradaEn:{not:null}},
     _sum:{diferencia:true},_count:{id:true}}),
    tx.turnoCaja.count({where:{caja:{sucursalId:b.id},cerradaEn:null}}),
    tx.$queryRaw<RawDay[]>`
      SELECT to_char(((v."cerradaEn" AT TIME ZONE ${b.zonaHoraria})
         - (${b.corte}::time - TIME '00:00'))::date,'YYYY-MM-DD') AS dia,
       COALESCE(SUM(v."total"),0)::text AS total,
       COALESCE(SUM(v."descuentoTotal"),0)::text AS descuentos,
       COUNT(*)::int AS cuentas,COUNT(DISTINCT c."ordenId")::int AS tickets
      FROM "Venta" v JOIN "Cuenta" c ON c.id=v."cuentaId"
      WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${p.from} AND v."cerradaEn"<${p.to}
      GROUP BY dia ORDER BY dia`,
    tx.$queryRaw<RawDay[]>`
      SELECT to_char(((p."cobradoEn" AT TIME ZONE ${b.zonaHoraria})
         - (${b.corte}::time - TIME '00:00'))::date,'YYYY-MM-DD') AS dia,
       COALESCE(SUM(p."monto"),0)::text AS total
      FROM "Pago" p JOIN "Cuenta" c ON c.id=p."cuentaId"
       JOIN "Orden" o ON o.id=c."ordenId"
      WHERE o."sucursalId"=${b.id} AND p."cobradoEn">=${p.from} AND p."cobradoEn"<${p.to}
      GROUP BY dia ORDER BY dia`,
    tx.$queryRaw<RawDay[]>`
      SELECT to_char(((r."creadoEn" AT TIME ZONE ${b.zonaHoraria})
         - (${b.corte}::time - TIME '00:00'))::date,'YYYY-MM-DD') AS dia,
       COALESCE(SUM(r."monto"),0)::text AS total
      FROM "ReembolsoPago" r JOIN "Pago" p ON p.id=r."pagoId"
       JOIN "Cuenta" c ON c.id=p."cuentaId" JOIN "Orden" o ON o.id=c."ordenId"
      WHERE o."sucursalId"=${b.id} AND r."creadoEn">=${p.from} AND r."creadoEn"<${p.to}
      GROUP BY dia ORDER BY dia`,
    tx.$queryRaw<RawDay[]>`
      SELECT to_char(((g."registradoEn" AT TIME ZONE ${b.zonaHoraria})
         - (${b.corte}::time - TIME '00:00'))::date,'YYYY-MM-DD') AS dia,
       COALESCE(SUM(g."monto"),0)::text AS total
      FROM "GastoOperativo" g
      WHERE g."sucursalId"=${b.id} AND g."registradoEn">=${p.from} AND g."registradoEn"<${p.to}
      GROUP BY dia ORDER BY dia`
   ]);
   const tickets=Number(ticketsCount[0]?.total??0);
   const value=dec(sales._sum.total),discount=dec(sales._sum.descuentoTotal);
   const cobrado=dec(paid._sum.monto),reembolso=dec(refunded._sum.monto);
   const keyed=(rows:RawDay[])=>new Map(rows.map(x=>[x.dia,x]));
   const sv=keyed(salesDays),pv=keyed(paymentDays),rv=keyed(refundDays),gv=keyed(expenseDays);
   const series=p.dias.map(d=>({
    fechaOperativa:d,ventasNetas:money(sv.get(d)?.total),
    descuentos:money(sv.get(d)?.descuentos),
    cobrosBrutos:money(pv.get(d)?.total),reembolsos:money(rv.get(d)?.total),
    cobrosNetos:dec(pv.get(d)?.total).minus(rv.get(d)?.total??0).toFixed(2),
    gastosRegistrados:money(gv.get(d)?.total),
    cuentasCerradas:sv.get(d)?.cuentas??0,ticketsDelDia:sv.get(d)?.tickets??0
   }));
   return {sucursal:b,periodo:{tipo:q.periodo,desde:p.desde,hasta:p.hasta,
     desdeUTC:p.from.toISOString(),hastaUTCExclusivo:p.to.toISOString(),
     horaCorte:b.corte,zonaHoraria:b.zonaHoraria},generatedAt:new Date().toISOString(),
    currency:b.moneda,source:'POSTGRESQL',estadoDatos:'ACTUAL_RECALCULABLE',
    kpis:{
     ventasNetas:value.toFixed(2),descuentos:discount.toFixed(2),
     ventasAntesDescuentos:value.plus(discount).toFixed(2),
     cuentasCerradas:sales._count.id,ticketsUnicos:tickets,
     ticketPromedio:tickets?value.div(tickets).toFixed(2):null,
     cobrosBrutos:cobrado.toFixed(2),reembolsos:reembolso.toFixed(2),
     cobrosNetos:cobrado.minus(reembolso).toFixed(2),
     gastosRegistrados:money(expenses._sum.monto),
     turnosCajaCerrados:cashClosed._count.id,
     diferenciaCajaCerrada:cashClosed._count.id?money(cashClosed._sum.diferencia):null,
     turnosCajaActualmenteAbiertos:cashOpen,
     margenBruto:null,resultadoNeto:null
    },
    definitions:{
     ventasNetas:'SUM(Venta.total) por Venta.cerradaEn; no son cobros',
     ticketsUnicos:'COUNT DISTINCT Cuenta.ordenId entre ventas cerradas',
     ticketPromedio:'ventasNetas / ticketsUnicos; null si no hay tickets',
     cobrosNetos:'SUM(Pago.monto) - SUM(ReembolsoPago.monto) por eventos de cada período',
     gastosRegistrados:'SUM(GastoOperativo.monto) según registradoEn; no se presumen pagados',
     diferenciaCajaCerrada:'SUM(TurnoCaja.diferencia) de turnos cerrados cuya fechaOperativa está en rango',
     margenBruto:'No calculado en este corte REP-1: requiere costo de consumo trazable de INV/REC',
     resultadoNeto:'No calculado hasta consolidar todas las reglas financieras'
    },
    serieDiaria:series};
  });
 }
 async tickets(u:Principal,q:TicketQuery){
  ensurePage(q.page,q.limit);
  return this.read(async tx=>{
   const b=await this.access(tx,u,q.sucursalId);
   const p=this.period(q,b),where={sucursalId:b.id,cerradaEn:{gte:p.from,lt:p.to}};
   const [rows,total]=await Promise.all([
    tx.venta.findMany({where,orderBy:[{cerradaEn:'desc'},{id:'desc'}],
     skip:(q.page-1)*q.limit,take:q.limit,select:{
      id:true,numero:true,total:true,descuentoTotal:true,cerradaEn:true,
      cuenta:{select:{id:true,orden:{select:{id:true,numero:true,modalidad:true,
       origen:true,estado:true,usuario:{select:{id:true,nombre:true}},
       cliente:{select:{id:true,nombre:true}}}}}}}
     }}),
    tx.venta.count({where})
   ]);
   return {sucursal:b,periodo:{desde:p.desde,hasta:p.hasta},
    data:rows.map(v=>({id:v.id,numero:v.numero,total:money(v.total),
     descuentoTotal:money(v.descuentoTotal),cerradaEn:v.cerradaEn,
     cuentaId:v.cuenta.id,orden:v.cuenta.orden})),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)},
    note:'Cada fila corresponde a una Venta/cuenta; los ticketsUnicos del resumen deduplican Orden.'};
  });
 }
}
