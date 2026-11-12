import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {resolveSalesPeriod} from '../../domain/sales-period.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CashSessionReportPort,type CashSessionReportSnapshot,type CashSessionRow}
 from '../../application/ports/cash-session-report.port.js';
import type {CashSessionReportQuery} from '../../application/contracts/cash-session-report.types.js';

type Tx=Prisma.TransactionClient;
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);
function todayGuatemala():string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
@Injectable()
export class CashSessionReportStore extends CashSessionReportPort{
 constructor(private readonly db:PrismaService){super();}
 // Same reports.read permission check as the other report-exports stores; duplicated on
 // purpose — see report-exports.module.ts.
 private async branch(tx:Tx,u:Principal,sucursalId:string){
  const [b,role]=await Promise.all([
   tx.sucursal.findUnique({where:{id:sucursalId},include:{configuracionSucursalesComoSucursal:true}}),
   tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
    {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:'reports.read'}}}}},
    {sucursalId,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:'reports.read'}}}}}
   ]},select:{id:true}})
  ]);
  if(!role)throw new ForbiddenException('Sin permiso reports.read en esta sucursal');
  if(!b?.activa)throw new NotFoundException('Sucursal no disponible');
  return {id:b.id,nombre:b.nombre,moneda:b.configuracionSucursalesComoSucursal?.moneda??'GTQ'};
 }
 async snapshot(u:Principal,q:CashSessionReportQuery):Promise<CashSessionReportSnapshot>{
  if(q.periodo==='PERSONALIZADO'&&(!q.desde||!q.hasta))
   throw new BadRequestException('Período personalizado requiere desde y hasta');
  return this.db.$transaction(async tx=>{
   const b=await this.branch(tx,u,q.sucursalId);
   const period=resolveSalesPeriod(q,todayGuatemala());
   // TurnoCaja.fechaOperativa is the day the shift itself was assigned to at open time —
   // the authoritative field for "which operational day does this session belong to",
   // unlike the daily/sales/inventory reports which bucket by wall-clock timestamps.
   const desde=new Date(period.desde+'T00:00:00.000Z'),hasta=new Date(period.hasta+'T00:00:00.000Z');
   const sesiones=await tx.turnoCaja.findMany({
    where:{caja:{sucursalId:b.id},fechaOperativa:{gte:desde,lte:hasta}},
    orderBy:[{fechaOperativa:'asc'},{abiertaEn:'asc'}],
    select:{id:true,fondoInicial:true,efectivoEsperado:true,efectivoContado:true,diferencia:true,
     fechaOperativa:true,abiertaEn:true,cerradaEn:true,notaCierre:true,
     caja:{select:{codigo:true,nombre:true}},cajero:{select:{nombre:true}},
     arqueoCajasComoTurno:{select:{contado:true,esperado:true,diferencia:true,nota:true,
      realizadoEn:true,realizadoPor:{select:{nombre:true}}}}}
   });
   const turnoIds=sesiones.map(s=>s.id);
   const [pagosPorTurno,gastosPorTurno,movCajaPorTurno]=turnoIds.length?await Promise.all([
    tx.pago.groupBy({by:['turnoId','metodo'],where:{turnoId:{in:turnoIds}},
     _sum:{monto:true},_count:{id:true}}),
    tx.gastoOperativo.groupBy({by:['turnoId'],where:{turnoId:{in:turnoIds}},_sum:{monto:true}}),
    tx.movimientoCaja.groupBy({by:['turnoId','tipo'],where:{turnoId:{in:turnoIds}},_sum:{monto:true}})
   ]):[[],[],[]];
   const gastoMap=new Map(gastosPorTurno.map(g=>[g.turnoId,dec(g._sum.monto)]));
   const turnos:CashSessionRow[]=sesiones.map(s=>{
    const arqueo=s.arqueoCajasComoTurno;
    const esperado=arqueo?arqueo.esperado:s.efectivoEsperado;
    const contado=arqueo?arqueo.contado:s.efectivoContado;
    const diferencia=arqueo?arqueo.diferencia:s.diferencia;
    const fuenteArqueo:CashSessionRow['fuenteArqueo']=arqueo?'ARQUEO_CAJA':
     (s.efectivoContado!=null?'TURNO_CAJA':'SIN_DATOS');
    const metodos=pagosPorTurno.filter(p=>p.turnoId===s.id)
     .map(p=>({metodo:p.metodo,monto:money(p._sum.monto),cantidad:p._count.id}));
    const mov=movCajaPorTurno.filter(m=>m.turnoId===s.id);
    const ingresos=mov.find(m=>m.tipo==='INGRESO')?._sum.monto;
    const egresos=mov.find(m=>m.tipo==='EGRESO')?._sum.monto;
    return {
     turnoId:s.id,caja:s.caja.codigo+' — '+s.caja.nombre,cajero:s.cajero.nombre,
     fechaOperativa:s.fechaOperativa.toISOString().slice(0,10),
     abiertaEn:s.abiertaEn.toISOString(),cerradaEn:s.cerradaEn?.toISOString()??'',
     estado:s.cerradaEn?'CERRADO':'ABIERTO',
     fondoInicial:money(s.fondoInicial),efectivoEsperado:money(esperado),
     efectivoContado:money(contado),diferencia:money(diferencia),
     fuenteArqueo,realizadoPor:arqueo?.realizadoPor.nombre??'',
     notaArqueo:arqueo?.nota??s.notaCierre??'',
     porMetodoPago:metodos,ingresos:money(ingresos),egresos:money(egresos),
     gastosDelTurno:money(gastoMap.get(s.id))
    };
   });
   const conDatos=turnos.filter(t=>t.fuenteArqueo!=='SIN_DATOS');
   return {
    sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,
    periodo:{tipo:q.periodo,desde:period.desde,hasta:period.hasta},
    generatedAt:new Date().toISOString(),
    resumen:{totalTurnos:turnos.length,
     abiertos:turnos.filter(t=>t.estado==='ABIERTO').length,
     cerrados:turnos.filter(t=>t.estado==='CERRADO').length,
     fondoInicial:turnos.reduce((a,t)=>a.plus(dec(t.fondoInicial)),dec(0)).toFixed(2),
     efectivoEsperado:conDatos.reduce((a,t)=>a.plus(dec(t.efectivoEsperado)),dec(0)).toFixed(2),
     efectivoContado:conDatos.reduce((a,t)=>a.plus(dec(t.efectivoContado)),dec(0)).toFixed(2),
     diferencia:conDatos.reduce((a,t)=>a.plus(dec(t.diferencia)),dec(0)).toFixed(2),
     turnosConDiferencia:conDatos.filter(t=>dec(t.diferencia).abs().greaterThan(0)).length},
    turnos
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:20000});
 }
}
