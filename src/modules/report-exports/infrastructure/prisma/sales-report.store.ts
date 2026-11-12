import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import {resolveSalesPeriod} from '../../domain/sales-period.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {SalesReportPort,type SalesReportSnapshot,type SalesReportDay} from '../../application/ports/sales-report.port.js';
import type {SalesReportQuery} from '../../application/contracts/sales-report.types.js';

type Tx=Prisma.TransactionClient;
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);
function todayGuatemala():string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
type RawDay={dia:string;monto:string;cantidad:number};
@Injectable()
export class SalesReportStore extends SalesReportPort{
 constructor(private readonly db:PrismaService){super();}
 // Same reports.read permission check as daily-report.store.ts; duplicated on purpose
 // rather than factored out — see report-exports.module.ts for why this module keeps
 // its internal pieces small and independent rather than growing shared infrastructure.
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
 async snapshot(u:Principal,q:SalesReportQuery):Promise<SalesReportSnapshot>{
  if(q.periodo==='PERSONALIZADO'&&(!q.desde||!q.hasta))
   throw new BadRequestException('Período personalizado requiere desde y hasta');
  return this.db.$transaction(async tx=>{
   const b=await this.branch(tx,u,q.sucursalId);
   const period=resolveSalesPeriod(q,todayGuatemala());
   const from=financialBusinessWindow(period.desde,'America/Guatemala','00:00').from;
   const to=financialBusinessWindow(period.hasta,'America/Guatemala','00:00').to;
   const span={gte:from,lt:to};
   const [ventas,pagos,reembolsos,ordenesCerradas,ordenesCanceladas,
    ventasDia,pagosDia,reembolsosDia,ordenesDia]=await Promise.all([
    tx.venta.aggregate({where:{sucursalId:b.id,cerradaEn:span},
     _sum:{total:true,descuentoTotal:true},_count:{id:true}}),
    tx.pago.groupBy({by:['metodo'],where:{cobradoEn:span,cuenta:{orden:{sucursalId:b.id}}},
     _sum:{monto:true},_count:{id:true}}),
    tx.$queryRaw<Array<{metodo:string;total:string}>>`
      SELECT p."metodo"::text AS metodo, COALESCE(SUM(r."monto"),0)::text AS total
      FROM "ReembolsoPago" r JOIN "Pago" p ON p.id=r."pagoId"
       JOIN "Cuenta" c ON c.id=p."cuentaId" JOIN "Orden" o ON o.id=c."ordenId"
      WHERE o."sucursalId"=${b.id} AND r."creadoEn">=${from} AND r."creadoEn"<${to}
      GROUP BY p."metodo"`,
    tx.orden.count({where:{sucursalId:b.id,cerradaEn:span}}),
    tx.orden.count({where:{sucursalId:b.id,canceladaEn:span}}),
    // Daily buckets use the Guatemala calendar date (fixed, same convention as the
    // daily report) via AT TIME ZONE — not each branch's own zonaHoraria/corte.
    tx.$queryRaw<Array<{dia:string;bruto:string;descuentos:string;cantidad:number}>>`
      SELECT ((v."cerradaEn" AT TIME ZONE 'America/Guatemala')::date)::text AS dia,
       COALESCE(SUM(v.total),0)::text AS bruto,
       COALESCE(SUM(v."descuentoTotal"),0)::text AS descuentos,
       COUNT(*)::int AS cantidad
      FROM "Venta" v WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${from} AND v."cerradaEn"<${to}
      GROUP BY dia`,
    tx.$queryRaw<RawDay[]>`
      SELECT ((p."cobradoEn" AT TIME ZONE 'America/Guatemala')::date)::text AS dia,
       COALESCE(SUM(p.monto),0)::text AS monto, COUNT(*)::int AS cantidad
      FROM "Pago" p JOIN "Cuenta" c ON c.id=p."cuentaId" JOIN "Orden" o ON o.id=c."ordenId"
      WHERE o."sucursalId"=${b.id} AND p."cobradoEn">=${from} AND p."cobradoEn"<${to}
      GROUP BY dia`,
    tx.$queryRaw<RawDay[]>`
      SELECT ((r."creadoEn" AT TIME ZONE 'America/Guatemala')::date)::text AS dia,
       COALESCE(SUM(r.monto),0)::text AS monto, COUNT(*)::int AS cantidad
      FROM "ReembolsoPago" r JOIN "Pago" p ON p.id=r."pagoId"
       JOIN "Cuenta" c ON c.id=p."cuentaId" JOIN "Orden" o ON o.id=c."ordenId"
      WHERE o."sucursalId"=${b.id} AND r."creadoEn">=${from} AND r."creadoEn"<${to}
      GROUP BY dia`,
    tx.$queryRaw<RawDay[]>`
      SELECT ((o."cerradaEn" AT TIME ZONE 'America/Guatemala')::date)::text AS dia,
       '0' AS monto, COUNT(*)::int AS cantidad
      FROM "Orden" o WHERE o."sucursalId"=${b.id} AND o."cerradaEn">=${from} AND o."cerradaEn"<${to}
      GROUP BY dia`
   ]);
   const refundByMethod=new Map(reembolsos.map(x=>[x.metodo,dec(x.total)]));
   const porMetodoPago=pagos.map(p=>{
    const cobrado=dec(p._sum.monto),reembolsado=refundByMethod.get(p.metodo)??dec(0);
    return {metodo:p.metodo,cobrado:cobrado.toFixed(2),reembolsado:reembolsado.toFixed(2),
     neto:cobrado.minus(reembolsado).toFixed(2),cantidad:p._count.id};
   });
   const cobradoTotal=pagos.reduce((a,p)=>a.plus(dec(p._sum.monto)),dec(0));
   const reembolsadoTotal=reembolsos.reduce((a,r)=>a.plus(dec(r.total)),dec(0));
   const ventasBrutas=dec(ventas._sum.total),descuentos=dec(ventas._sum.descuentoTotal);
   const ventasNetas=ventasBrutas.minus(descuentos);
   const dineroEntrante=cobradoTotal.minus(reembolsadoTotal);

   const ventasDiaMap=new Map(ventasDia.map(v=>[v.dia,v]));
   const pagosDiaMap=new Map(pagosDia.map(v=>[v.dia,v]));
   const reembolsosDiaMap=new Map(reembolsosDia.map(v=>[v.dia,v]));
   const ordenesDiaMap=new Map(ordenesDia.map(v=>[v.dia,v]));
   const serieDiaria:SalesReportDay[]=period.dias.map(fecha=>{
    const v=ventasDiaMap.get(fecha),p=pagosDiaMap.get(fecha),r=reembolsosDiaMap.get(fecha),
     o=ordenesDiaMap.get(fecha);
    const bruto=dec(v?.bruto),desc=dec(v?.descuentos),cobrado=dec(p?.monto),reemb=dec(r?.monto);
    return {fecha,ventasBrutas:bruto.toFixed(2),descuentos:desc.toFixed(2),
     ventasNetas:bruto.minus(desc).toFixed(2),cantidadVentas:v?.cantidad??0,
     cobrado:cobrado.toFixed(2),reembolsado:reemb.toFixed(2),
     dineroEntrante:cobrado.minus(reemb).toFixed(2),ordenesCerradas:o?.cantidad??0};
   });
   return {
    sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,
    periodo:{tipo:q.periodo,desde:period.desde,hasta:period.hasta},
    generatedAt:new Date().toISOString(),
    resumen:{ventasBrutas:money(ventasBrutas),descuentos:money(descuentos),
     ventasNetas:ventasNetas.toFixed(2),cantidadVentas:ventas._count.id,
     cobrado:cobradoTotal.toFixed(2),reembolsado:reembolsadoTotal.toFixed(2),
     dineroEntrante:dineroEntrante.toFixed(2),ordenesCerradas,ordenesCanceladas},
    porMetodoPago,serieDiaria
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:20000});
 }
}
