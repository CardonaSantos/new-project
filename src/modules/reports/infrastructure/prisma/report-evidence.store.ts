import {ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {operationalDate} from '../../../payments/domain/payment.policy.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import {resolvePeriod,ensurePage} from '../../domain/report-period.policy.js';
import type {TicketQuery} from '../../application/contracts/reporting.types.js';
import {ReportEvidencePort,type CashEvidenceQuery} from '../../application/ports/report-evidence.port.js';
type Tx=Prisma.TransactionClient;
const amount=(x:Prisma.Decimal|null|undefined)=>x===null||x===undefined?null:x.toFixed(2);
const positive=(x:Prisma.Decimal|null|undefined)=>x?.toFixed(2)??'0.00';
const pageInfo=(page:number,limit:number,total:number)=>({
 page,limit,total,totalPages:Math.ceil(total/limit)
});
@Injectable()
export class ReportEvidenceStore extends ReportEvidencePort{
 constructor(private readonly db:PrismaService){super();}
 private read<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
  return this.db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20000});
 }
 private async permitted(tx:Tx,u:Principal,branchId:string,scopes:string[]){
  for(const code of ['reports.read',...scopes]){
   const role=await tx.usuarioRol.findFirst({where:{
    usuarioId:u.id,usuario:{activo:true},OR:[
     {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
     {sucursalId:branchId,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}
    ]},select:{id:true}});
   if(!role)throw new ForbiddenException('Permiso '+code+' insuficiente para la sucursal');
  }
 }
 private async branch(tx:Tx,id:string){
  const row=await tx.sucursal.findUnique({where:{id},
   include:{configuracionSucursalesComoSucursal:true}});
  if(!row?.activa)throw new NotFoundException('Sucursal no disponible');
  return {id:row.id,nombre:row.nombre,codigo:row.codigo,
   zonaHoraria:row.zonaHoraria,
   corte:row.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00',
   moneda:row.configuracionSucursalesComoSucursal?.moneda??'GTQ'};
 }
 private period(q:TicketQuery,branch:{zonaHoraria:string;corte:string}){
  const current=operationalDate(new Date(),branch.zonaHoraria,branch.corte).toISOString().slice(0,10);
  const dates=resolvePeriod(q,current);
  return {...dates,from:financialBusinessWindow(dates.desde,branch.zonaHoraria,branch.corte).from,
   to:financialBusinessWindow(dates.hasta,branch.zonaHoraria,branch.corte).to};
 }
 async cashShift(u:Principal,shiftId:string,q:CashEvidenceQuery){
  ensurePage(q.page,q.limit);
  return this.read(async tx=>{
   await this.permitted(tx,u,q.sucursalId,['cash.read']);
   const branch=await this.branch(tx,q.sucursalId);
   const shift=await tx.turnoCaja.findFirst({
    where:{id:shiftId,caja:{sucursalId:q.sucursalId}},
    include:{caja:{select:{id:true,codigo:true,nombre:true}},
     cajero:{select:{id:true,nombre:true}},
     arqueoCajasComoTurno:{select:{id:true,contado:true,esperado:true,diferencia:true,
      realizadoEn:true,realizadoPor:{select:{id:true,nombre:true}},nota:true}}}
   });
   if(!shift)throw new NotFoundException('Turno no encontrado en sucursal autorizada');
   const where:Prisma.MovimientoCajaWhereInput={turnoId:shiftId,
    ...(q.tipo?{tipo:q.tipo}:{})};
   const [rows,total,grouped]=await Promise.all([
    tx.movimientoCaja.findMany({where,skip:(q.page-1)*q.limit,take:q.limit,
     orderBy:[{creadoEn:'asc'},{id:'asc'}],
     include:{
      usuario:{select:{id:true,nombre:true}},
      pago:{select:{id:true,monto:true,metodo:true,referencia:true,cobradoEn:true,
       cuenta:{select:{id:true,orden:{select:{id:true,numero:true}}}}}},
      reembolso:{select:{id:true,pagoId:true,monto:true,motivo:true,creadoEn:true}},
      gasto:{select:{id:true,monto:true,categoria:true,tipo:true,descripcion:true,
       documentoReferencia:true,registradoEn:true}},
      pagoProveedor:{select:{id:true,monto:true,metodo:true,proveedorId:true,
       referencia:true,estado:true,confirmadoEn:true}},
      liquidacionRepartidor:{select:{id:true,repartidorId:true,estado:true,
       totalEsperado:true,totalEntregado:true,cerradaEn:true}}
     }}),
    tx.movimientoCaja.count({where}),
    tx.movimientoCaja.groupBy({by:['tipo'],where,
     _sum:{monto:true},_count:{id:true}})
   ]);
   const origin=(m:typeof rows[number])=>{
    if(m.pago)return {tipo:'PAGO',id:m.pago.id,tabla:'Pago',
     cuentaId:m.pago.cuenta.id,ordenId:m.pago.cuenta.orden.id,
     numeroOrden:m.pago.cuenta.orden.numero,
     metodo:m.pago.metodo,referencia:m.pago.referencia,
     importeDocumento:amount(m.pago.monto),fechaDocumento:m.pago.cobradoEn};
    if(m.reembolso)return {tipo:'REEMBOLSO',id:m.reembolso.id,tabla:'ReembolsoPago',
     pagoOriginalId:m.reembolso.pagoId,motivo:m.reembolso.motivo,
     importeDocumento:amount(m.reembolso.monto),fechaDocumento:m.reembolso.creadoEn};
    if(m.gasto)return {tipo:'GASTO',id:m.gasto.id,tabla:'GastoOperativo',
     categoria:m.gasto.categoria,tipoGasto:m.gasto.tipo,
     descripcion:m.gasto.descripcion,documentoReferencia:m.gasto.documentoReferencia,
     importeDocumento:amount(m.gasto.monto),fechaDocumento:m.gasto.registradoEn};
    if(m.pagoProveedor)return {tipo:'PAGO_PROVEEDOR',id:m.pagoProveedor.id,tabla:'PagoProveedor',
     proveedorId:m.pagoProveedor.proveedorId,metodo:m.pagoProveedor.metodo,
     estado:m.pagoProveedor.estado,referencia:m.pagoProveedor.referencia,
     importeDocumento:amount(m.pagoProveedor.monto),fechaDocumento:m.pagoProveedor.confirmadoEn};
    if(m.liquidacionRepartidor)return {tipo:'LIQUIDACION_REPARTIDOR',id:m.liquidacionRepartidor.id,
     tabla:'LiquidacionRepartidor',repartidorId:m.liquidacionRepartidor.repartidorId,
     estado:m.liquidacionRepartidor.estado,
     totalEsperado:amount(m.liquidacionRepartidor.totalEsperado),
     totalEntregado:amount(m.liquidacionRepartidor.totalEntregado),
     fechaDocumento:m.liquidacionRepartidor.cerradaEn};
    return {tipo:'MANUAL',id:m.id,tabla:'MovimientoCaja',
     descripcion:'Movimiento de caja sin documento enlazado; revisar motivo, actor y auditoría'};
   };
   const data=rows.map(m=>({movimientoId:m.id,turnoId:m.turnoId,
    fecha:m.creadoEn,tipo:m.tipo,monto:positive(m.monto),motivo:m.motivo,
    registradoPor:m.usuario,fuente:origin(m),
    referenciaIds:{pagoId:m.pagoId,reembolsoId:m.reembolsoId,gastoId:m.gastoId,
     pagoProveedorId:m.pagoProveedorId,liquidacionRepartidorId:m.liquidacionRepartidorId}}));
   const totalTipo=(type:'INGRESO'|'EGRESO')=>grouped.find(x=>x.tipo===type);
   const ingresos=positive(totalTipo('INGRESO')?._sum.monto);
   const egresos=positive(totalTipo('EGRESO')?._sum.monto);
   const sum=(t:string)=>grouped.find(x=>x.tipo===t)?._count.id??0;
   return {version:'REP_EVIDENCE_V1',sucursal:branch,
    generadoEn:new Date().toISOString(),
    turno:{id:shift.id,fechaOperativa:shift.fechaOperativa.toISOString().slice(0,10),
     caja:shift.caja,cajero:shift.cajero,abiertaEn:shift.abiertaEn,cerradaEn:shift.cerradaEn,
     fondoInicial:positive(shift.fondoInicial),
     efectivoEsperado:amount(shift.efectivoEsperado),
     efectivoContado:amount(shift.efectivoContado),diferencia:amount(shift.diferencia),
     notaCierre:shift.notaCierre,
     arqueo:shift.arqueoCajasComoTurno?{
      id:shift.arqueoCajasComoTurno.id,
      contado:positive(shift.arqueoCajasComoTurno.contado),
      esperado:positive(shift.arqueoCajasComoTurno.esperado),
      diferencia:positive(shift.arqueoCajasComoTurno.diferencia),
      realizadoEn:shift.arqueoCajasComoTurno.realizadoEn,
      realizadoPor:shift.arqueoCajasComoTurno.realizadoPor,
      nota:shift.arqueoCajasComoTurno.nota}:null},
    filtro:{tipo:q.tipo??null},
    totalesFiltro:{ingresos,egresos,cantidadIngresos:sum('INGRESO'),cantidadEgresos:sum('EGRESO'),
     saldoMovimientos:new Prisma.Decimal(ingresos).minus(egresos).toFixed(2)},
    data,meta:pageInfo(q.page,q.limit,total),
    definicion:'Sumatoria de MovimientoCaja por turno/tipo, NO ventas adicionales. '+
     'Cada fila apunta al documento de origen o se identifica como MANUAL. '+
     'El arqueo de turno es distinto al saldo aritmético de movimientos.'};
  });
 }
 async payments(u:Principal,q:TicketQuery){
  ensurePage(q.page,q.limit);
  return this.read(async tx=>{
   await this.permitted(tx,u,q.sucursalId,['payments.read']);
   const branch=await this.branch(tx,q.sucursalId);
   const range=this.period(q,branch);
   const where:Prisma.PagoWhereInput={cuenta:{orden:{sucursalId:branch.id}},
    cobradoEn:{gte:range.from,lt:range.to}};
   const [rows,total]=await Promise.all([
    tx.pago.findMany({where,orderBy:[{cobradoEn:'asc'},{id:'asc'}],
     take:q.limit,skip:(q.page-1)*q.limit,
     include:{cobradoPor:{select:{id:true,nombre:true}},
      cuenta:{select:{id:true,orden:{select:{id:true,numero:true}}}},
      movimientoCajasComoPago:{select:{id:true,turnoId:true,monto:true,tipo:true}},
      reembolsoPagosComoPago:{select:{id:true,monto:true,creadoEn:true}}}}}),
    tx.pago.count({where})
   ]);
   return {version:'REP_EVIDENCE_V1',sucursal:branch,moneda:branch.moneda,
    periodo:{desde:range.desde,hasta:range.hasta},
    generatedAt:new Date().toISOString(),
    data:rows.map(p=>({pagoId:p.id,cuentaId:p.cuenta.id,ordenId:p.cuenta.orden.id,
     numeroOrden:p.cuenta.orden.numero,cobradoEn:p.cobradoEn,
     cobradoPor:p.cobradoPor,metodo:p.metodo,importe:positive(p.monto),
     referencia:p.referencia,recibidoPorRepartidor:p.recibidoPorRepartidor,
     movimientoCajaId:p.movimientoCajasComoPago?.id??null,
     turnoCajaId:p.movimientoCajasComoPago?.turnoId??p.turnoId,
     reembolsos:p.reembolsoPagosComoPago.map(x=>({id:x.id,monto:positive(x.monto),
      fecha:x.creadoEn}))})),
    meta:pageInfo(q.page,q.limit,total),
    definicion:'Lista de pagos por cobradoEn; cada reembolso enlazado se presenta aparte '+
     'y puede pertenecer a otro período. No sumar reembolsos sin filtrar por fecha.'};
  });
 }
 async expenses(u:Principal,q:TicketQuery){
  ensurePage(q.page,q.limit);
  return this.read(async tx=>{
   await this.permitted(tx,u,q.sucursalId,['finance.expenses.read']);
   const branch=await this.branch(tx,q.sucursalId);
   const range=this.period(q,branch);
   const where:Prisma.GastoOperativoWhereInput={sucursalId:branch.id,
    registradoEn:{gte:range.from,lt:range.to}};
   const [rows,total]=await Promise.all([
    tx.gastoOperativo.findMany({where,orderBy:[{registradoEn:'asc'},{id:'asc'}],
     take:q.limit,skip:(q.page-1)*q.limit,
     include:{usuario:{select:{id:true,nombre:true}},
      proveedor:{select:{id:true,nombre:true}},
      movimientoCajasComoGasto:{select:{id:true,turnoId:true,tipo:true,monto:true}}}}}),
    tx.gastoOperativo.count({where})
   ]);
   return {version:'REP_EVIDENCE_V1',sucursal:branch,moneda:branch.moneda,
    periodo:{desde:range.desde,hasta:range.hasta},
    generatedAt:new Date().toISOString(),
    data:rows.map(x=>({gastoId:x.id,registradoEn:x.registradoEn,
     descripcion:x.descripcion,categoria:x.categoria??'SIN_CATEGORIA',tipo:x.tipo,
     importe:positive(x.monto),documentoReferencia:x.documentoReferencia,
     registradoPor:x.usuario,proveedor:x.proveedor,
     cuentaFinancieraId:x.cuentaFinancieraId,turnoCajaId:x.turnoId,
     movimientoCajaId:x.movimientoCajasComoGasto?.id??null})),
    meta:pageInfo(q.page,q.limit,total),
    definicion:'Lista de gastos registrados; no prueba cobro, pago ni salida bancaria. '+
     'El movimiento de caja enlazado se identifica si existe.'};
  });
 }
}
