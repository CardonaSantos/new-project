import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import {resolveSalesPeriod} from '../../domain/sales-period.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ProfitabilityReportPort,type ProfitabilityReportSnapshot,
 type ProfitabilityProductRow,type ProfitabilityCategoryRow} from '../../application/ports/profitability-report.port.js';
import type {ProfitabilityReportQuery} from '../../application/contracts/profitability-report.types.js';

type Tx=Prisma.TransactionClient;
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);
const DEFAULT_LIMIT=200,MAX_LIMIT=2000;
function todayGuatemala():string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
type RawProductoRow={
 productoId:string;productoNombre:string;categoriaId:string|null;categoriaNombre:string;
 cantidadVendida:string;ingresoBruto:string;descuentos:string;
 costo:string;lineasConCosto:number;lineasTotal:number;
};
type RawCategoriaRow={
 categoriaId:string|null;categoriaNombre:string;productos:number;
 cantidadVendida:string;ingresoBruto:string;descuentos:string;
 costo:string;lineasConCosto:number;lineasTotal:number;
};
function margenPct(ingresoNeto:Prisma.Decimal,margen:Prisma.Decimal):string{
 if(ingresoNeto.isZero())return '0.00';
 return margen.dividedBy(ingresoNeto).times(100).toDecimalPlaces(2).toFixed(2);
}

@Injectable()
export class ProfitabilityReportStore extends ProfitabilityReportPort{
 constructor(private readonly db:PrismaService){super();}
 // Same reports.read permission check as the other report stores in this module;
 // duplicated on purpose — see report-exports.module.ts for why this module keeps
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
 async snapshot(u:Principal,q:ProfitabilityReportQuery):Promise<ProfitabilityReportSnapshot>{
  if(q.periodo==='PERSONALIZADO'&&(!q.desde||!q.hasta))
   throw new BadRequestException('Período personalizado requiere desde y hasta');
  const limite=Math.min(q.limite??DEFAULT_LIMIT,MAX_LIMIT);
  return this.db.$transaction(async tx=>{
   const b=await this.branch(tx,u,q.sucursalId);
   const period=resolveSalesPeriod(q,todayGuatemala());
   const from=financialBusinessWindow(period.desde,'America/Guatemala','00:00').from;
   const to=financialBusinessWindow(period.hasta,'America/Guatemala','00:00').to;

   // Revenue comes from VentaLinea (what was actually sold, through Venta.sucursalId +
   // Venta.cerradaEn — same scoping as the sales report). Cost comes from
   // ConsumoOrdenLinea, the real inventory consumption recorded for that order line's
   // recipe, reached via ConsumoOrden.ordenLineaId (two hops: OrdenLinea -> ConsumoOrden
   // -> ConsumoOrdenLinea). Not every order line necessarily has consumption recorded
   // (e.g. TipoProducto.SERVICIO, or a product sold before consumption was wired up), so
   // cost is a LEFT JOIN and we separately count how many lines actually had a cost figure
   // (lineasConCosto) versus how many lines were sold in total (lineasTotal) — the report
   // flags this instead of silently treating a missing cost as zero margin-neutral.
   const [productosRaw,categoriasRaw]=await Promise.all([
    tx.$queryRaw<RawProductoRow[]>`
      WITH consumo AS (
       SELECT co."ordenLineaId" AS orden_linea_id,
        SUM(col.cantidad*col."costoUnitario") AS costo
       FROM "ConsumoOrdenLinea" col JOIN "ConsumoOrden" co ON co.id=col."consumoId"
       WHERE co."ordenLineaId" IS NOT NULL
       GROUP BY co."ordenLineaId"
      )
      SELECT p.id AS "productoId", p.nombre AS "productoNombre",
       cat.id AS "categoriaId", COALESCE(cat.nombre,'(sin categoría)') AS "categoriaNombre",
       COALESCE(SUM(vl.cantidad),0)::text AS "cantidadVendida",
       COALESCE(SUM(vl.subtotal),0)::text AS "ingresoBruto",
       COALESCE(SUM(vl.descuento),0)::text AS "descuentos",
       COALESCE(SUM(c.costo),0)::text AS "costo",
       COUNT(DISTINCT CASE WHEN c.orden_linea_id IS NOT NULL THEN ol.id END)::int AS "lineasConCosto",
       COUNT(DISTINCT ol.id)::int AS "lineasTotal"
      FROM "VentaLinea" vl
       JOIN "Venta" v ON v.id=vl."ventaId"
       JOIN "OrdenLinea" ol ON ol.id=vl."ordenLineaId"
       JOIN "VarianteProducto" vp ON vp.id=ol."varianteId"
       JOIN "Producto" p ON p.id=vp."productoId"
       LEFT JOIN "Categoria" cat ON cat.id=p."categoriaId"
       LEFT JOIN consumo c ON c.orden_linea_id=ol.id
      WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${from} AND v."cerradaEn"<${to}
      GROUP BY p.id,p.nombre,cat.id,cat.nombre
      ORDER BY "ingresoBruto" DESC`,
    tx.$queryRaw<RawCategoriaRow[]>`
      WITH consumo AS (
       SELECT co."ordenLineaId" AS orden_linea_id,
        SUM(col.cantidad*col."costoUnitario") AS costo
       FROM "ConsumoOrdenLinea" col JOIN "ConsumoOrden" co ON co.id=col."consumoId"
       WHERE co."ordenLineaId" IS NOT NULL
       GROUP BY co."ordenLineaId"
      )
      SELECT cat.id AS "categoriaId", COALESCE(cat.nombre,'(sin categoría)') AS "categoriaNombre",
       COUNT(DISTINCT p.id)::int AS "productos",
       COALESCE(SUM(vl.cantidad),0)::text AS "cantidadVendida",
       COALESCE(SUM(vl.subtotal),0)::text AS "ingresoBruto",
       COALESCE(SUM(vl.descuento),0)::text AS "descuentos",
       COALESCE(SUM(c.costo),0)::text AS "costo",
       COUNT(DISTINCT CASE WHEN c.orden_linea_id IS NOT NULL THEN ol.id END)::int AS "lineasConCosto",
       COUNT(DISTINCT ol.id)::int AS "lineasTotal"
      FROM "VentaLinea" vl
       JOIN "Venta" v ON v.id=vl."ventaId"
       JOIN "OrdenLinea" ol ON ol.id=vl."ordenLineaId"
       JOIN "VarianteProducto" vp ON vp.id=ol."varianteId"
       JOIN "Producto" p ON p.id=vp."productoId"
       LEFT JOIN "Categoria" cat ON cat.id=p."categoriaId"
       LEFT JOIN consumo c ON c.orden_linea_id=ol.id
      WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${from} AND v."cerradaEn"<${to}
      GROUP BY cat.id,cat.nombre
      ORDER BY "ingresoBruto" DESC`
   ]);

   const productosTruncado=productosRaw.length>limite;
   const productos:ProfitabilityProductRow[]=productosRaw.slice(0,limite).map(r=>{
    const bruto=dec(r.ingresoBruto),descuento=dec(r.descuentos),costo=dec(r.costo);
    const neto=bruto.minus(descuento),margen=neto.minus(costo);
    return {productoId:r.productoId,productoNombre:r.productoNombre,
     categoriaId:r.categoriaId,categoriaNombre:r.categoriaNombre,
     cantidadVendida:dec(r.cantidadVendida).toFixed(3),
     ingresoBruto:bruto.toFixed(2),descuentos:descuento.toFixed(2),ingresoNeto:neto.toFixed(2),
     costo:costo.toFixed(2),margen:margen.toFixed(2),margenPct:margenPct(neto,margen),
     lineasConCosto:r.lineasConCosto,lineasTotal:r.lineasTotal};
   });
   const categorias:ProfitabilityCategoryRow[]=categoriasRaw.map(r=>{
    const bruto=dec(r.ingresoBruto),descuento=dec(r.descuentos),costo=dec(r.costo);
    const neto=bruto.minus(descuento),margen=neto.minus(costo);
    return {categoriaId:r.categoriaId,categoriaNombre:r.categoriaNombre,productos:r.productos,
     cantidadVendida:dec(r.cantidadVendida).toFixed(3),
     ingresoBruto:bruto.toFixed(2),descuentos:descuento.toFixed(2),ingresoNeto:neto.toFixed(2),
     costo:costo.toFixed(2),margen:margen.toFixed(2),margenPct:margenPct(neto,margen),
     lineasConCosto:r.lineasConCosto,lineasTotal:r.lineasTotal};
   });

   const totalBruto=productosRaw.reduce((a,r)=>a.plus(dec(r.ingresoBruto)),dec(0));
   const totalDescuento=productosRaw.reduce((a,r)=>a.plus(dec(r.descuentos)),dec(0));
   const totalCosto=productosRaw.reduce((a,r)=>a.plus(dec(r.costo)),dec(0));
   const totalLineasConCosto=productosRaw.reduce((a,r)=>a+r.lineasConCosto,0);
   const totalLineas=productosRaw.reduce((a,r)=>a+r.lineasTotal,0);
   const ingresoNetoTotal=totalBruto.minus(totalDescuento);
   const margenTotal=ingresoNetoTotal.minus(totalCosto);

   return {
    sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,
    periodo:{tipo:q.periodo,desde:period.desde,hasta:period.hasta},
    generatedAt:new Date().toISOString(),
    resumen:{
     ingresoNeto:ingresoNetoTotal.toFixed(2),costo:totalCosto.toFixed(2),
     margen:margenTotal.toFixed(2),margenPct:margenPct(ingresoNetoTotal,margenTotal),
     lineasConCosto:totalLineasConCosto,lineasTotal:totalLineas,
     costoCompleto:totalLineas===totalLineasConCosto
    },
    categorias,productos,productosTruncado
   };
  });
 }
}
