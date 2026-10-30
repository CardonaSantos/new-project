import {Prisma} from '../../../../generated/prisma/client.js';

// Costs belong to the sale-closing date. Preparation is joined across its whole
// history, not filtered to that date. This avoids comparing unrelated periods.
// One movement contributes once per consumed ingredient; allocation across split
// VentaLinea rows uses cumulative rounding to exactly six decimal places.
type Tx=Prisma.TransactionClient;
type Scope={id:string;nombre:string;moneda:string;desde:string;hasta:string;
 zonaHoraria:string;corte:string;from:Date;to:Date};
type RawRow={id:string;ventaId:string;ordenLineaId:string;ordenId:string;numeroOrden:string;
 fecha:Date;modalidad:string;productoId:string;producto:string;varianteId:string;
 variante:string;descripcion:string;cantidad:string;ingreso:string;
 cobertura:string;costosDirectos:string|null;documentosConsumo:string[]|null};
type RawTotals={lineas:number;lineasConCosto:number;lineasSinCosto:number;
 lineasNoAplicables:number;ingresos:string;costoIdentificado:string;
 margenAntesEmpaque:string|null};
type RawProduct={productoId:string;producto:string;lineas:number;
 lineasConCosto:number;lineasSinCosto:number;lineasNoAplicables:number;
 ingresos:string;costoIdentificado:string;margenAntesEmpaque:string|null};
const cents=(v:string)=>new Prisma.Decimal(v).toFixed(2);
const micros=(v:string|null)=>v===null?null:new Prisma.Decimal(v).toFixed(6);
const meta=(page:number,limit:number,total:number)=>({page,limit,total,
 totalPages:Math.ceil(total/limit)});

export async function salesCostAttribution(tx:Tx,b:Scope,page:number,limit:number){
 const skip=(page-1)*limit;
 const base=Prisma.sql`WITH period_sales AS (
  SELECT vl.id,vl."ventaId",vl."ordenLineaId",vl.descripcion,vl.cantidad,
   vl.subtotal,v."cerradaEn" AS fecha,ol."ordenId",
   o.numero AS "numeroOrden",o.modalidad::text AS modalidad,
   vp.id AS "varianteId",vp.nombre AS variante,
   pr.id AS "productoId",pr.nombre AS producto,pr.tipo::text AS "tipoProducto"
  FROM "VentaLinea" vl JOIN "Venta" v ON v.id=vl."ventaId"
   JOIN "OrdenLinea" ol ON ol.id=vl."ordenLineaId"
   JOIN "Orden" o ON o.id=ol."ordenId"
   JOIN "VarianteProducto" vp ON vp.id=ol."varianteId"
   JOIN "Producto" pr ON pr.id=vp."productoId"
  WHERE v."sucursalId"=${b.id} AND v."cerradaEn">=${b.from}
   AND v."cerradaEn"<${b.to} AND o."sucursalId"=${b.id}
 ), relevant_lines AS (
  SELECT DISTINCT "ordenLineaId" FROM period_sales
 ), doc_costs AS (
  SELECT co.id,co."ordenLineaId",co.tipo::text AS tipo,
   co."cantidadPreparada",COUNT(cl.id)::int AS ingredientes,
   COUNT(cl.id) FILTER (WHERE mi.id IS NULL)::int AS invalidos,
   COALESCE(SUM(mi."costoTotal"),0)::numeric AS costo
  FROM "ConsumoOrden" co JOIN relevant_lines rel
   ON rel."ordenLineaId"=co."ordenLineaId"
  LEFT JOIN "ConsumoOrdenLinea" cl ON cl."consumoId"=co.id
  LEFT JOIN "MovimientoInventario" mi ON mi.id=cl."movimientoId"
   AND mi.tipo='CONSUMO' AND mi."referenciaTipo"='CONSUMO_ORDEN'
   AND mi."referenciaId"=co.id
   AND mi."articuloId"=cl."articuloId"
   AND mi."ubicacionId"=cl."ubicacionId"
   AND mi."loteId" IS NOT DISTINCT FROM cl."loteId"
   AND mi.cantidad=-cl.cantidad
  WHERE co.tipo IN ('RECETA','DIRECTO')
  GROUP BY co.id
 ), line_costs AS (
  SELECT "ordenLineaId",
   COUNT(*)::int AS documentos,
   COALESCE(SUM("cantidadPreparada"),0)::numeric AS preparado,
   COUNT(*) FILTER (WHERE "cantidadPreparada" IS NULL)::int AS "sinCantidad",
   COUNT(*) FILTER (WHERE ingredientes=0 OR invalidos>0)::int AS "incompletos",
   COUNT(*) FILTER (WHERE tipo='RECETA')::int AS recetas,
   COUNT(*) FILTER (WHERE tipo='DIRECTO')::int AS directos,
   SUM(costo)::numeric AS costo,
   ARRAY_AGG(id ORDER BY id) AS "documentosConsumo"
  FROM doc_costs GROUP BY "ordenLineaId"
 ), all_sales AS (
  SELECT vl.id,vl."ordenLineaId",vl.cantidad,
   SUM(vl.cantidad) OVER (PARTITION BY vl."ordenLineaId") AS "totalVendido",
   SUM(vl.cantidad) OVER (PARTITION BY vl."ordenLineaId"
    ORDER BY vl.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado
  FROM "VentaLinea" vl JOIN relevant_lines rel ON rel."ordenLineaId"=vl."ordenLineaId"
 ), coverage AS (
  SELECT ps.*,lc.costo,lc."documentosConsumo",a."totalVendido",a.acumulado,
   CASE
    WHEN ps."tipoProducto"='SERVICIO' THEN 'NO_APLICA'
    WHEN lc.documentos IS NULL THEN 'SIN_CONSUMO'
    WHEN lc.incompletos>0 OR lc."sinCantidad">0 THEN 'CONSUMO_INCOMPLETO'
    WHEN ps."tipoProducto"='PREPARADO' AND lc.directos>0
      OR ps."tipoProducto"='INVENTARIABLE' AND lc.recetas>0 THEN 'TIPO_INCOMPATIBLE'
    WHEN lc.preparado<>a."totalVendido" OR a."totalVendido"<=0
      THEN 'CANTIDAD_NO_CONCILIA'
    ELSE 'COMPLETO'
   END AS cobertura,
   a.cantidad AS "cantidadParaAsignar"
  FROM period_sales ps JOIN all_sales a ON a.id=ps.id
  LEFT JOIN line_costs lc ON lc."ordenLineaId"=ps."ordenLineaId"
 ), attributed AS (
  SELECT c.*,
   CASE WHEN c.cobertura='COMPLETO'
     THEN ROUND(c.costo*c.acumulado/c."totalVendido",6)
         -ROUND(c.costo*(c.acumulado-c."cantidadParaAsignar")/c."totalVendido",6)
     ELSE NULL END AS "costoAsignado"
  FROM coverage c
 )`;
 const [rows,totals,products]=await Promise.all([
  tx.$queryRaw<RawRow[]>(Prisma.sql`${base}
   SELECT id,"ventaId","ordenLineaId","ordenId","numeroOrden",fecha,modalidad,
    "productoId",producto,"varianteId",variante,descripcion,
    cantidad::text AS cantidad,subtotal::text AS ingreso,
    cobertura,"costoAsignado"::text AS "costosDirectos","documentosConsumo"
   FROM attributed ORDER BY fecha,id LIMIT ${limit} OFFSET ${skip}`),
  tx.$queryRaw<RawTotals[]>(Prisma.sql`${base}
   SELECT COUNT(*)::int AS lineas,
    COUNT(*) FILTER (WHERE cobertura='COMPLETO')::int AS "lineasConCosto",
    COUNT(*) FILTER (WHERE cobertura NOT IN ('COMPLETO','NO_APLICA'))::int AS "lineasSinCosto",
    COUNT(*) FILTER (WHERE cobertura='NO_APLICA')::int AS "lineasNoAplicables",
    COALESCE(SUM(subtotal),0)::text AS ingresos,
    COALESCE(SUM("costoAsignado"),0)::text AS "costoIdentificado",
    CASE WHEN COUNT(*)=COUNT(*) FILTER (WHERE cobertura='COMPLETO')
     THEN COALESCE(SUM(subtotal-"costoAsignado"),0)::text ELSE NULL END
     AS "margenAntesEmpaque"
   FROM attributed`),
  tx.$queryRaw<RawProduct[]>(Prisma.sql`${base}
   SELECT "productoId",producto,COUNT(*)::int AS lineas,
    COUNT(*) FILTER (WHERE cobertura='COMPLETO')::int AS "lineasConCosto",
    COUNT(*) FILTER (WHERE cobertura NOT IN ('COMPLETO','NO_APLICA'))::int AS "lineasSinCosto",
    COUNT(*) FILTER (WHERE cobertura='NO_APLICA')::int AS "lineasNoAplicables",
    COALESCE(SUM(subtotal),0)::text AS ingresos,
    COALESCE(SUM("costoAsignado"),0)::text AS "costoIdentificado",
    CASE WHEN COUNT(*)=COUNT(*) FILTER (WHERE cobertura='COMPLETO')
     THEN COALESCE(SUM(subtotal-"costoAsignado"),0)::text ELSE NULL END
     AS "margenAntesEmpaque"
   FROM attributed GROUP BY "productoId",producto
   ORDER BY SUM(subtotal) DESC,"productoId"`)
 ]);
 const t=totals[0]??{lineas:0,lineasConCosto:0,lineasSinCosto:0,
  lineasNoAplicables:0,ingresos:'0',costoIdentificado:'0',margenAntesEmpaque:null};
 return {
  totales:{registros:t.lineas,ingresos:cents(t.ingresos),
   lineasConCosto:t.lineasConCosto,lineasSinCosto:t.lineasSinCosto,
   lineasNoAplicables:t.lineasNoAplicables,
   costoDirectoIdentificado:micros(t.costoIdentificado),
   margenAntesEmpaque:micros(t.margenAntesEmpaque)},
  porProducto:products.map(p=>({productoId:p.productoId,producto:p.producto,
   registros:p.lineas,ingresos:cents(p.ingresos),lineasConCosto:p.lineasConCosto,
   lineasSinCosto:p.lineasSinCosto,lineasNoAplicables:p.lineasNoAplicables,
   costoDirectoIdentificado:micros(p.costoIdentificado),
   margenAntesEmpaque:micros(p.margenAntesEmpaque)})),
  data:rows.map(x=>({ventaLineaId:x.id,ventaId:x.ventaId,ordenLineaId:x.ordenLineaId,
   ordenId:x.ordenId,numeroOrden:x.numeroOrden,fecha:x.fecha,
   modalidad:x.modalidad,productoId:x.productoId,producto:x.producto,
   varianteId:x.varianteId,variante:x.variante,descripcion:x.descripcion,
   cantidad:new Prisma.Decimal(x.cantidad).toFixed(3),ingreso:cents(x.ingreso),
   cobertura:x.cobertura,documentosConsumo:x.documentosConsumo??[],
   costoDirecto:micros(x.costosDirectos),
   margenAntesEmpaque:x.costosDirectos===null?null:
    new Prisma.Decimal(x.ingreso).minus(x.costosDirectos).toFixed(6)})),
  meta:meta(page,limit,t.lineas)
 };
}
