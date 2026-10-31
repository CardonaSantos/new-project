import {Prisma} from '../../../../generated/prisma/client.js';

// Operational consumption cohort. Current order state is a snapshot, NOT the
// status at consumption time. Never mix this amount with same-day sale COGS.
type Tx=Prisma.TransactionClient;
type Scope={id:string;nombre:string;moneda:string;desde:string;hasta:string;
 zonaHoraria:string;corte:string;from:Date;to:Date};
type Row={
 ordenId:string;numeroOrden:string;estadoActual:string;modalidad:string;
 canceladaEn:Date|null;clasificacionCancelacion:string|null;
 autorizadaCancelacionPreparada:boolean;importeAnulado:string;
 documentos:number;documentosReceta:number;documentosDirecto:number;
 documentosEmpaque:number;lineas:number;lineasSinMovimiento:number;
 documentosSinLineas:number;documentosIncompletos:number;
 costoIdentificado:string;costoRecetasIdentificado:string;
 costoDirectoIdentificado:string;costoEmpaqueIdentificado:string;
 costoCompleto:string|null;documentosConsumo:string[];
};
type Total={
 ordenes:number;documentos:number;documentosReceta:number;documentosDirecto:number;
 documentosEmpaque:number;lineas:number;lineasSinMovimiento:number;
 documentosSinLineas:number;documentosIncompletos:number;
 ordenesIncompletas:number;costoIdentificado:string;
 costoEmpaqueIdentificado:string;costoCanceladasIdentificado:string;
 costoCerradasIdentificado:string;costoAbiertasIdentificado:string;
 costoCompleto:string|null;
};
type Group={estadoActual:string;ordenes:number;documentos:number;
 documentosIncompletos:number;costoIdentificado:string;costoCompleto:string|null};
const money6=(s:string|null)=>s===null?null:new Prisma.Decimal(s).toFixed(6);
const money2=(s:string)=>new Prisma.Decimal(s).toFixed(2);
const pageMeta=(page:number,limit:number,total:number)=>({page,limit,total,
 totalPages:Math.ceil(total/limit)});

export async function orderCostOutcomes(tx:Tx,b:Scope,page:number,limit:number){
 const skip=(page-1)*limit;
 const base=Prisma.sql`WITH document_costs AS (
  SELECT co.id,co."ordenId",co.tipo::text AS tipo,
   COUNT(cl.id)::int AS lineas,
   COUNT(cl.id) FILTER (WHERE mi.id IS NULL)::int AS "lineasSinMovimiento",
   COALESCE(SUM(mi."costoTotal"),0)::numeric AS costo
  FROM "ConsumoOrden" co JOIN "Orden" o ON o.id=co."ordenId"
  LEFT JOIN "ConsumoOrdenLinea" cl ON cl."consumoId"=co.id
  LEFT JOIN "MovimientoInventario" mi ON mi.id=cl."movimientoId"
   AND mi.tipo='CONSUMO' AND mi."referenciaTipo"='CONSUMO_ORDEN'
   AND mi."referenciaId"=co.id AND mi."articuloId"=cl."articuloId"
   AND mi."ubicacionId"=cl."ubicacionId"
   AND mi."loteId" IS NOT DISTINCT FROM cl."loteId"
   AND mi.cantidad=-cl.cantidad
  WHERE o."sucursalId"=${b.id} AND co."creadoEn">=${b.from}
   AND co."creadoEn"<${b.to}
  GROUP BY co.id
 ), by_order AS (
  SELECT d."ordenId",
   COUNT(*)::int AS documentos,
   COUNT(*) FILTER (WHERE tipo='RECETA')::int AS "documentosReceta",
   COUNT(*) FILTER (WHERE tipo='DIRECTO')::int AS "documentosDirecto",
   COUNT(*) FILTER (WHERE tipo='EMPAQUE')::int AS "documentosEmpaque",
   COALESCE(SUM(lineas),0)::int AS lineas,
   COALESCE(SUM("lineasSinMovimiento"),0)::int AS "lineasSinMovimiento",
   COUNT(*) FILTER (WHERE lineas=0)::int AS "documentosSinLineas",
   COUNT(*) FILTER (WHERE lineas=0 OR "lineasSinMovimiento">0)::int AS "documentosIncompletos",
   SUM(costo)::numeric AS "costoIdentificado",
   COALESCE(SUM(costo) FILTER (WHERE tipo='RECETA'),0)::numeric AS "costoRecetasIdentificado",
   COALESCE(SUM(costo) FILTER (WHERE tipo='DIRECTO'),0)::numeric AS "costoDirectoIdentificado",
   COALESCE(SUM(costo) FILTER (WHERE tipo='EMPAQUE'),0)::numeric AS "costoEmpaqueIdentificado",
   CASE WHEN COUNT(*) FILTER (WHERE lineas=0 OR "lineasSinMovimiento">0)=0
    THEN SUM(costo)::text ELSE NULL END AS "costoCompleto",
   ARRAY_AGG(id ORDER BY id) AS "documentosConsumo"
  FROM document_costs d GROUP BY d."ordenId"
 ), result_orders AS (
  SELECT o.numero AS "numeroOrden",o.estado::text AS "estadoActual",
   o.modalidad::text AS modalidad,o."canceladaEn",o."clasificacionCancelacion",
   o."autorizadaCancelacionPreparada",o."importeAnulado"::text AS "importeAnulado",
   bo.*
  FROM by_order bo JOIN "Orden" o ON o.id=bo."ordenId"
 )`;
 const [rows,totals,groups]=await Promise.all([
  tx.$queryRaw<Row[]>(Prisma.sql`${base}
   SELECT "ordenId","numeroOrden","estadoActual",modalidad,
    "canceladaEn","clasificacionCancelacion","autorizadaCancelacionPreparada",
    "importeAnulado",documentos,"documentosReceta","documentosDirecto",
    "documentosEmpaque",lineas,"lineasSinMovimiento","documentosSinLineas",
    "documentosIncompletos","costoIdentificado"::text AS "costoIdentificado",
    "costoRecetasIdentificado"::text AS "costoRecetasIdentificado",
    "costoDirectoIdentificado"::text AS "costoDirectoIdentificado",
    "costoEmpaqueIdentificado"::text AS "costoEmpaqueIdentificado",
    "costoCompleto","documentosConsumo"
   FROM result_orders ORDER BY "numeroOrden","ordenId"
   LIMIT ${limit} OFFSET ${skip}`),
  tx.$queryRaw<Total[]>(Prisma.sql`${base}
   SELECT COUNT(*)::int AS ordenes,
    COALESCE(SUM(documentos),0)::int AS documentos,
    COALESCE(SUM("documentosReceta"),0)::int AS "documentosReceta",
    COALESCE(SUM("documentosDirecto"),0)::int AS "documentosDirecto",
    COALESCE(SUM("documentosEmpaque"),0)::int AS "documentosEmpaque",
    COALESCE(SUM(lineas),0)::int AS lineas,
    COALESCE(SUM("lineasSinMovimiento"),0)::int AS "lineasSinMovimiento",
    COALESCE(SUM("documentosSinLineas"),0)::int AS "documentosSinLineas",
    COALESCE(SUM("documentosIncompletos"),0)::int AS "documentosIncompletos",
    COUNT(*) FILTER (WHERE "costoCompleto" IS NULL)::int AS "ordenesIncompletas",
    COALESCE(SUM("costoIdentificado"),0)::text AS "costoIdentificado",
    COALESCE(SUM("costoEmpaqueIdentificado"),0)::text AS "costoEmpaqueIdentificado",
    COALESCE(SUM("costoIdentificado") FILTER (WHERE "estadoActual"='CANCELADA'),0)::text
     AS "costoCanceladasIdentificado",
    COALESCE(SUM("costoIdentificado") FILTER (WHERE "estadoActual"='CERRADA'),0)::text
     AS "costoCerradasIdentificado",
    COALESCE(SUM("costoIdentificado") FILTER (WHERE "estadoActual"='ABIERTA'),0)::text
     AS "costoAbiertasIdentificado",
    CASE WHEN COUNT(*)>0 AND COUNT(*) FILTER (WHERE "costoCompleto" IS NULL)=0
     THEN SUM("costoIdentificado")::text ELSE NULL END AS "costoCompleto"
   FROM result_orders`),
  tx.$queryRaw<Group[]>(Prisma.sql`${base}
   SELECT "estadoActual",COUNT(*)::int AS ordenes,
    COALESCE(SUM(documentos),0)::int AS documentos,
    COALESCE(SUM("documentosIncompletos"),0)::int AS "documentosIncompletos",
    COALESCE(SUM("costoIdentificado"),0)::text AS "costoIdentificado",
    CASE WHEN COUNT(*) FILTER (WHERE "costoCompleto" IS NULL)=0
     THEN SUM("costoIdentificado")::text ELSE NULL END AS "costoCompleto"
   FROM result_orders GROUP BY "estadoActual" ORDER BY "estadoActual"`)
 ]);
 const t=totals[0]??{ordenes:0,documentos:0,documentosReceta:0,
  documentosDirecto:0,documentosEmpaque:0,lineas:0,
  lineasSinMovimiento:0,documentosSinLineas:0,documentosIncompletos:0,
  ordenesIncompletas:0,costoIdentificado:'0',costoEmpaqueIdentificado:'0',
  costoCanceladasIdentificado:'0',costoCerradasIdentificado:'0',
  costoAbiertasIdentificado:'0',costoCompleto:null};
 return {
  totales:{ordenes:t.ordenes,documentos:t.documentos,
   documentosReceta:t.documentosReceta,documentosDirecto:t.documentosDirecto,
   documentosEmpaque:t.documentosEmpaque,
   lineas:t.lineas,lineasSinMovimiento:t.lineasSinMovimiento,
   documentosSinLineas:t.documentosSinLineas,
   documentosIncompletos:t.documentosIncompletos,
   ordenesIncompletas:t.ordenesIncompletas,
   costoIdentificado:money6(t.costoIdentificado),
   costoCompleto:money6(t.costoCompleto),
   costoEmpaqueIdentificado:money6(t.costoEmpaqueIdentificado),
   costoCanceladasIdentificado:money6(t.costoCanceladasIdentificado),
   costoCerradasIdentificado:money6(t.costoCerradasIdentificado),
   costoAbiertasIdentificado:money6(t.costoAbiertasIdentificado),
   empaqueRegistrado:t.documentosEmpaque>0},
  porEstado:groups.map(g=>({estadoActual:g.estadoActual,ordenes:g.ordenes,
   documentos:g.documentos,documentosIncompletos:g.documentosIncompletos,
   costoIdentificado:money6(g.costoIdentificado),
   costoCompleto:money6(g.costoCompleto)})),
  data:rows.map(x=>({ordenId:x.ordenId,numeroOrden:x.numeroOrden,
   estadoActual:x.estadoActual,modalidad:x.modalidad,
   canceladaEn:x.canceladaEn,clasificacionCancelacion:x.clasificacionCancelacion,
   autorizadaCancelacionPreparada:x.autorizadaCancelacionPreparada,
   importeAnulado:money2(x.importeAnulado),
   documentos:x.documentos,documentosReceta:x.documentosReceta,
   documentosDirecto:x.documentosDirecto,documentosEmpaque:x.documentosEmpaque,
   lineas:x.lineas,lineasSinMovimiento:x.lineasSinMovimiento,
   documentosSinLineas:x.documentosSinLineas,
   documentosIncompletos:x.documentosIncompletos,
   costoIdentificado:money6(x.costoIdentificado),
   costoRecetasIdentificado:money6(x.costoRecetasIdentificado),
   costoDirectoIdentificado:money6(x.costoDirectoIdentificado),
   costoEmpaqueIdentificado:money6(x.costoEmpaqueIdentificado),
   costoCompleto:money6(x.costoCompleto),
   empaqueRegistrado:x.documentosEmpaque>0,
   documentosConsumo:x.documentosConsumo})),
  meta:pageMeta(page,limit,t.ordenes)
 };
}
