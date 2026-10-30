import {Prisma} from '../../../../generated/prisma/client.js';
type Tx=Prisma.TransactionClient;
type Scope={id:string;zonaHoraria:string;corte:string;from:Date;to:Date};
type DailyRow={fecha:string;registros:number;cobrado?:string;costoIdentificado?:string;
 cuentas?:number;reembolsadoDelDia?:string};
const amount=(v:string|null|undefined,dp:number)=>
 new Prisma.Decimal(v??0).toFixed(dp);

export async function exportDaily(tx:Tx,scope:Scope,source:string){
 const [hours,minutes]=scope.corte.split(':').map(Number);
 const offset=hours*60+minutes;
 const day=(field:Prisma.Sql)=>Prisma.sql`TO_CHAR(
  ((${field} AT TIME ZONE ${scope.zonaHoraria}) -
   make_interval(mins => ${offset})), 'YYYY-MM-DD')`;
 if(source==='PAYMENT_SALES_RECON'){
  const rows=await tx.$queryRaw<DailyRow[]>(Prisma.sql`
   WITH payments AS (
    SELECT ${day(Prisma.sql`p."cobradoEn"`)} AS fecha,p."cuentaId",p.monto
    FROM "Pago" p JOIN "Cuenta" c ON c.id=p."cuentaId"
     JOIN "Orden" o ON o.id=c."ordenId"
    WHERE o."sucursalId"=${scope.id} AND p."cobradoEn">=${scope.from}
      AND p."cobradoEn"<${scope.to}
   ), refunds AS (
    SELECT ${day(Prisma.sql`r."creadoEn"`)} AS fecha,r.monto
    FROM "ReembolsoPago" r JOIN "Pago" p ON p.id=r."pagoId"
     JOIN "Cuenta" c ON c.id=p."cuentaId" JOIN "Orden" o ON o.id=c."ordenId"
    WHERE o."sucursalId"=${scope.id} AND r."creadoEn">=${scope.from}
      AND r."creadoEn"<${scope.to}
   ), daily_pay AS (
    SELECT fecha,COUNT(*)::int AS registros,
     COUNT(DISTINCT "cuentaId")::int AS cuentas,
     COALESCE(SUM(monto),0)::text AS cobrado
    FROM payments GROUP BY fecha
   ), daily_refunds AS (
    SELECT fecha,COALESCE(SUM(monto),0)::text AS "reembolsadoDelDia"
    FROM refunds GROUP BY fecha
   )
   SELECT COALESCE(p.fecha,r.fecha) AS fecha,
    COALESCE(p.registros,0)::int AS registros,
    COALESCE(p.cuentas,0)::int AS cuentas,
    COALESCE(p.cobrado,'0') AS cobrado,
    COALESCE(r."reembolsadoDelDia",'0') AS "reembolsadoDelDia"
   FROM daily_pay p FULL OUTER JOIN daily_refunds r ON r.fecha=p.fecha
   ORDER BY fecha`);
  return {diario:rows.map(x=>({fecha:x.fecha,pagos:x.registros,cuentas:x.cuentas,
   cobrado:amount(x.cobrado,2),reembolsosDelDia:amount(x.reembolsadoDelDia,2)})),
   diarioNota:'Pagos por cobradoEn y reembolsos por creadoEn. Los reembolsos del día NO equivalen a reembolsadoHistorico de la cohorte de pagos.'};
 }
 if(source==='ORDER_COST_OUTCOMES'||source==='PREPARATION_COSTS'){
  const rows=await tx.$queryRaw<DailyRow[]>(Prisma.sql`
   WITH consumo AS (
    SELECT co.id,${day(Prisma.sql`co."creadoEn"`)} AS fecha,
     COALESCE(SUM(mi."costoTotal"),0)::numeric AS costo
    FROM "ConsumoOrden" co JOIN "Orden" o ON o.id=co."ordenId"
    LEFT JOIN "ConsumoOrdenLinea" cl ON cl."consumoId"=co.id
    LEFT JOIN "MovimientoInventario" mi ON mi.id=cl."movimientoId"
     AND mi.tipo='CONSUMO' AND mi."referenciaTipo"='CONSUMO_ORDEN'
     AND mi."referenciaId"=co.id AND mi."articuloId"=cl."articuloId"
     AND mi."ubicacionId"=cl."ubicacionId"
     AND mi."loteId" IS NOT DISTINCT FROM cl."loteId"
     AND mi.cantidad=-cl.cantidad
    WHERE o."sucursalId"=${scope.id} AND co."creadoEn">=${scope.from}
      AND co."creadoEn"<${scope.to}
    GROUP BY co.id,co."creadoEn"
   )
   SELECT fecha,COUNT(*)::int AS registros,
    COALESCE(SUM(costo),0)::text AS "costoIdentificado"
   FROM consumo GROUP BY fecha ORDER BY fecha`);
  return {diario:rows.map(x=>({fecha:x.fecha,documentos:x.registros,
   costoIdentificado:amount(x.costoIdentificado,6)})),
   diarioNota:'Costos históricos de consumo según ConsumoOrden.creadoEn, no fecha de venta ni cancelación. Costo identificado puede ser parcial si faltan movimientos.'};
 }
 return {diario:[] as Record<string,unknown>[],diarioNota:''};
}
