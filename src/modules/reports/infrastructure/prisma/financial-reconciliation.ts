import {Prisma} from '../../../../generated/prisma/client.js';

// Separate accounting cohorts. Payments are grouped by their payment date,
// supplier invoices by their confirmation date, settlements by creation date,
// and bank statement lines by bank value-date (not by account movement time).
type Tx=Prisma.TransactionClient;
export type FinanceScope={id:string;nombre:string;moneda:string;desde:string;hasta:string;
 zonaHoraria:string;corte:string;from:Date;to:Date};
const money=(v:string|Prisma.Decimal|number|null|undefined)=>
 new Prisma.Decimal(v??0).toFixed(2);
const metadata=(page:number,limit:number,total:number)=>({page,limit,total,totalPages:Math.ceil(total/limit)});
type PaymentRow={cuentaId:string;ordenId:string;numeroOrden:string;estadoOrden:string;
 estadoCuenta:string;ventaId:string|null;ventaCerradaEn:Date|null;
 cuentaTotal:string;cuentaPagado:string;pagos:number;cobrado:string;
 reembolsadoHistorico:string;netoHistorico:string;};
type PaymentTotals={cuentas:number;cuentasSinVenta:number;cuentasConVenta:number;
 pagos:number;cobrado:string;reembolsadoHistorico:string;netoHistorico:string};
export async function paymentSalesReconciliation(tx:Tx,b:FinanceScope,page:number,limit:number){
 const base=Prisma.sql`WITH pagos_periodo AS (
  SELECT p.id,p."cuentaId",p.monto
  FROM "Pago" p JOIN "Cuenta" c ON c.id=p."cuentaId"
  JOIN "Orden" o ON o.id=c."ordenId"
  WHERE o."sucursalId"=${b.id} AND p."cobradoEn">=${b.from}
   AND p."cobradoEn"<${b.to}
 ), pagos_agrupados AS (
  SELECT "cuentaId",COUNT(*)::int AS pagos,SUM(monto)::numeric AS cobrado
  FROM pagos_periodo GROUP BY "cuentaId"
 ), refunds_all_time AS (
  SELECT pp."cuentaId",SUM(r.monto)::numeric AS reembolsado
  FROM pagos_periodo pp JOIN "ReembolsoPago" r ON r."pagoId"=pp.id
  GROUP BY pp."cuentaId"
 ), cuentas AS (
  SELECT c.id AS "cuentaId",o.id AS "ordenId",o.numero AS "numeroOrden",
   o.estado::text AS "estadoOrden",c.estado::text AS "estadoCuenta",
   v.id AS "ventaId",v."cerradaEn" AS "ventaCerradaEn",
   c.total::text AS "cuentaTotal",c.pagado::text AS "cuentaPagado",
   pa.pagos,pa.cobrado,COALESCE(ra.reembolsado,0)::numeric AS "reembolsadoHistorico",
   (pa.cobrado-COALESCE(ra.reembolsado,0))::numeric AS "netoHistorico"
  FROM pagos_agrupados pa JOIN "Cuenta" c ON c.id=pa."cuentaId"
  JOIN "Orden" o ON o.id=c."ordenId"
  LEFT JOIN "Venta" v ON v."cuentaId"=c.id AND v."sucursalId"=${b.id}
  LEFT JOIN refunds_all_time ra ON ra."cuentaId"=c.id
 )`;
 const [rows,totals]=await Promise.all([
  tx.$queryRaw<PaymentRow[]>(Prisma.sql`${base}
   SELECT "cuentaId","ordenId","numeroOrden","estadoOrden","estadoCuenta",
   "ventaId","ventaCerradaEn","cuentaTotal","cuentaPagado",pagos,
   cobrado::text AS cobrado,"reembolsadoHistorico"::text AS "reembolsadoHistorico",
   "netoHistorico"::text AS "netoHistorico"
   FROM cuentas ORDER BY "numeroOrden","cuentaId"
   LIMIT ${limit} OFFSET ${(page-1)*limit}`),
  tx.$queryRaw<PaymentTotals[]>(Prisma.sql`${base}
   SELECT COUNT(*)::int AS cuentas,
    COUNT(*) FILTER (WHERE "ventaId" IS NULL)::int AS "cuentasSinVenta",
    COUNT(*) FILTER (WHERE "ventaId" IS NOT NULL)::int AS "cuentasConVenta",
    COALESCE(SUM(pagos),0)::int AS pagos,
    COALESCE(SUM(cobrado),0)::text AS cobrado,
    COALESCE(SUM("reembolsadoHistorico"),0)::text AS "reembolsadoHistorico",
    COALESCE(SUM("netoHistorico"),0)::text AS "netoHistorico"
   FROM cuentas`)
 ]);
 const t=totals[0]??{cuentas:0,cuentasSinVenta:0,cuentasConVenta:0,
  pagos:0,cobrado:'0',reembolsadoHistorico:'0',netoHistorico:'0'};
 return {totales:{cuentas:t.cuentas,cuentasSinVenta:t.cuentasSinVenta,
  cuentasConVenta:t.cuentasConVenta,pagos:t.pagos,
  cobrado:money(t.cobrado),reembolsadoHistorico:money(t.reembolsadoHistorico),
  netoHistorico:money(t.netoHistorico)},
  data:rows.map(r=>({cuentaId:r.cuentaId,ordenId:r.ordenId,numeroOrden:r.numeroOrden,
   estadoOrden:r.estadoOrden,estadoCuenta:r.estadoCuenta,ventaId:r.ventaId,
   ventaCerradaEn:r.ventaCerradaEn,cuentaTotal:money(r.cuentaTotal),
   cuentaPagadoActual:money(r.cuentaPagado),pagos:r.pagos,cobrado:money(r.cobrado),
   reembolsadoHistorico:money(r.reembolsadoHistorico),
   netoHistorico:money(r.netoHistorico),
   reconocimientoVenta:r.ventaId?'CON_VENTA':'SIN_VENTA'})),
  meta:metadata(page,limit,t.cuentas)};
}

type SupplierRow={id:string;proveedorId:string;proveedor:string;numeroDocumento:string;
 fechaEmision:Date;confirmadaEn:Date|null;fechaVencimiento:Date|null;
 total:string;pagosAplicados:string;creditosAplicados:string;saldo:string};
type SupplierTotals={facturas:number;proveedores:number;facturado:string;
 pagosAplicados:string;creditosAplicados:string;saldo:string;saldoNegativo:number};
export async function supplierBalances(tx:Tx,b:FinanceScope,page:number,limit:number){
 const base=Prisma.sql`WITH current_invoices AS (
  SELECT f.id,f."proveedorId",pr.nombre AS proveedor,f."numeroDocumento",
   f."fechaEmision",f."confirmadaEn",f."fechaVencimiento",f.total
  FROM "FacturaProveedor" f JOIN "Proveedor" pr ON pr.id=f."proveedorId"
  WHERE f."sucursalId"=${b.id} AND f.estado='CONFIRMADA'
   AND f."confirmadaEn" IS NOT NULL AND f."confirmadaEn"<${b.to}
 ), rows AS (
  SELECT f.*,
   COALESCE(pay.amount,0)::numeric AS "pagosAplicados",
   COALESCE(credit.amount,0)::numeric AS "creditosAplicados",
   (f.total-COALESCE(pay.amount,0)-COALESCE(credit.amount,0))::numeric AS saldo
  FROM current_invoices f
  LEFT JOIN LATERAL (
   SELECT SUM(ap.monto) AS amount FROM "AplicacionPagoProveedor" ap
   JOIN "PagoProveedor" p ON p.id=ap."pagoId"
   WHERE ap."facturaId"=f.id AND p.estado='CONFIRMADO'
    AND p."sucursalId"=${b.id} AND p."confirmadoEn" IS NOT NULL
    AND p."confirmadoEn"<${b.to}
  ) pay ON TRUE
  LEFT JOIN LATERAL (
   SELECT SUM(ap.monto) AS amount FROM "AplicacionNotaCreditoProveedor" ap
   JOIN "NotaCreditoProveedor" n ON n.id=ap."notaId"
   WHERE ap."facturaId"=f.id AND n.estado='CONFIRMADA'
    AND n."sucursalId"=${b.id} AND n."confirmadaEn" IS NOT NULL
    AND n."confirmadaEn"<${b.to}
  ) credit ON TRUE
 )`;
 const [rows,totals]=await Promise.all([
 tx.$queryRaw<SupplierRow[]>(Prisma.sql`${base}
  SELECT id,"proveedorId",proveedor,"numeroDocumento","fechaEmision",
   "confirmadaEn","fechaVencimiento",total::text AS total,
   "pagosAplicados"::text AS "pagosAplicados",
   "creditosAplicados"::text AS "creditosAplicados",saldo::text AS saldo
  FROM rows ORDER BY "proveedorId",id LIMIT ${limit}
   OFFSET ${(page-1)*limit}`),
 tx.$queryRaw<SupplierTotals[]>(Prisma.sql`${base}
  SELECT COUNT(*)::int AS facturas,COUNT(DISTINCT "proveedorId")::int AS proveedores,
   COALESCE(SUM(total),0)::text AS facturado,
   COALESCE(SUM("pagosAplicados"),0)::text AS "pagosAplicados",
   COALESCE(SUM("creditosAplicados"),0)::text AS "creditosAplicados",
   COALESCE(SUM(saldo),0)::text AS saldo,
   COUNT(*) FILTER (WHERE saldo<0)::int AS "saldoNegativo"
  FROM rows`)]);
 const t=totals[0]??{facturas:0,proveedores:0,facturado:'0',
  pagosAplicados:'0',creditosAplicados:'0',saldo:'0',saldoNegativo:0};
 return {totales:{facturas:t.facturas,proveedores:t.proveedores,
  facturado:money(t.facturado),pagosAplicados:money(t.pagosAplicados),
  creditosAplicados:money(t.creditosAplicados),
  saldo:money(t.saldo),facturasConSaldoNegativo:t.saldoNegativo},
  data:rows.map(r=>({...r,total:money(r.total),
   pagosAplicados:money(r.pagosAplicados),
   creditosAplicados:money(r.creditosAplicados),
   saldo:money(r.saldo)})),meta:metadata(page,limit,t.facturas)};
}

export async function platformSettlements(tx:Tx,b:FinanceScope,page:number,limit:number){
 const where:Prisma.LiquidacionCanalExternoWhereInput={sucursalId:b.id,
  creadaEn:{gte:b.from,lt:b.to}};
 const [rows,total,stats]=await Promise.all([
  tx.liquidacionCanalExterno.findMany({where,skip:(page-1)*limit,take:limit,
   orderBy:[{creadaEn:'asc'},{id:'asc'}],
   select:{id:true,canalId:true,cuentaFinancieraId:true,periodoInicio:true,
    periodoFin:true,referencia:true,totalBruto:true,totalComision:true,
    totalNeto:true,recibidaEn:true,creadaEn:true,
    liquidacionCanalExternoLineasComoLiquidacion:{
     select:{id:true,entregaId:true,importeBruto:true,comision:true,importeNeto:true}}}}),
  tx.liquidacionCanalExterno.count({where}),
  tx.liquidacionCanalExterno.aggregate({where,
   _sum:{totalBruto:true,totalComision:true,totalNeto:true}})
 ]);
 return {totales:{liquidaciones:total,bruto:money(stats._sum.totalBruto),
  comisiones:money(stats._sum.totalComision),neto:money(stats._sum.totalNeto)},
  data:rows.map(r=>({id:r.id,canalId:r.canalId,
   cuentaFinancieraId:r.cuentaFinancieraId,
   periodoInicio:r.periodoInicio,periodoFin:r.periodoFin,
   referencia:r.referencia,creadaEn:r.creadaEn,recibidaEn:r.recibidaEn,
   bruto:money(r.totalBruto),comision:money(r.totalComision),neto:money(r.totalNeto),
   lineas:r.liquidacionCanalExternoLineasComoLiquidacion.map(l=>({
    id:l.id,entregaId:l.entregaId,bruto:money(l.importeBruto),
    comision:money(l.comision),neto:money(l.importeNeto)}))})),
  meta:metadata(page,limit,total)};
}

export async function bankMatchStatus(tx:Tx,b:FinanceScope,page:number,limit:number){
 // Value dates are DATE, not business-day timestamps. No silent timezone shift.
 const from=new Date(b.desde+'T00:00:00.000Z'),
       to=new Date(b.hasta+'T00:00:00.000Z');
 const where:Prisma.LineaExtractoBancarioWhereInput={
  cuentaFinanciera:{sucursalId:b.id,moneda:b.moneda},
  fecha:{gte:from,lte:to}};
 const [rows,total,unmatched,stats]=await Promise.all([
  tx.lineaExtractoBancario.findMany({where,skip:(page-1)*limit,take:limit,
   orderBy:[{fecha:'asc'},{id:'asc'}],
   select:{id:true,cuentaFinancieraId:true,fecha:true,monto:true,
    movimientoFinancieroId:true,conciliadoEn:true,validacionReferencia:true}}),
  tx.lineaExtractoBancario.count({where}),
  tx.lineaExtractoBancario.count({where:{...where,movimientoFinancieroId:null}}),
  tx.lineaExtractoBancario.aggregate({where,_sum:{monto:true}})
 ]);
 return {totales:{lineas:total,conciliadas:total-unmatched,pendientes:unmatched,
  movimientoExtracto:money(stats._sum.monto)},
  data:rows.map(x=>({id:x.id,cuentaFinancieraId:x.cuentaFinancieraId,
   fecha:x.fecha,monto:money(x.monto),
   conciliado:x.movimientoFinancieroId!==null,
   movimientoFinancieroId:x.movimientoFinancieroId,
   conciliadoEn:x.conciliadoEn,validacionReferencia:x.validacionReferencia})),
  meta:metadata(page,limit,total)};
}
