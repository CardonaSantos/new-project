import {Prisma} from '../../../../generated/prisma/client.js';

type Tx=Prisma.TransactionClient;
export type BranchWindow={id:string;nombre:string;moneda:string;desde:string;hasta:string;
 zonaHoraria:string;corte:string;from:Date;to:Date};
type RollupRow={sucursalId:string;ventas:number;ingresos:string;
 pagos:number;cobrado:string;reembolsos:number;reembolsado:string;
 liquidaciones:number;comisiones:string;netoLiquidado:string};
const currency=(v:string)=>new Prisma.Decimal(v).toFixed(2);

// Aggregate independent ledgers *before* joining by branch. A JOIN from sale
// lines directly to payments would multiply money on split accounts.
export async function financialBranchRollup(tx:Tx,branches:BranchWindow[]){
 if(!branches.length)return {data:[],totalesPorMoneda:[]};
 const pairs=Prisma.join(branches.map(b=>Prisma.sql`(${b.id}::text,${b.from}::timestamptz,${b.to}::timestamptz)`));
 const rows=await tx.$queryRaw<RollupRow[]>(Prisma.sql`
  WITH windows("sucursalId",inicio,fin) AS (VALUES ${pairs}),
  ventas AS (
   SELECT w."sucursalId",COUNT(v.id)::int AS ventas,
    COALESCE(SUM(v.total),0)::numeric AS ingresos
   FROM windows w LEFT JOIN "Venta" v ON v."sucursalId"=w."sucursalId"
    AND v."cerradaEn">=w.inicio AND v."cerradaEn"<w.fin
   GROUP BY w."sucursalId"
  ), pagos AS (
   SELECT w."sucursalId",COUNT(p.id)::int AS pagos,
    COALESCE(SUM(p.monto),0)::numeric AS cobrado
   FROM windows w LEFT JOIN "Orden" o ON o."sucursalId"=w."sucursalId"
   LEFT JOIN "Cuenta" c ON c."ordenId"=o.id
   LEFT JOIN "Pago" p ON p."cuentaId"=c.id
    AND p."cobradoEn">=w.inicio AND p."cobradoEn"<w.fin
   GROUP BY w."sucursalId"
  ), refunds AS (
   SELECT w."sucursalId",COUNT(r.id)::int AS reembolsos,
    COALESCE(SUM(r.monto),0)::numeric AS reembolsado
   FROM windows w LEFT JOIN "Orden" o ON o."sucursalId"=w."sucursalId"
   LEFT JOIN "Cuenta" c ON c."ordenId"=o.id
   LEFT JOIN "Pago" p ON p."cuentaId"=c.id
   LEFT JOIN "ReembolsoPago" r ON r."pagoId"=p.id
    AND r."creadoEn">=w.inicio AND r."creadoEn"<w.fin
   GROUP BY w."sucursalId"
  ), platforms AS (
   SELECT w."sucursalId",COUNT(l.id)::int AS liquidaciones,
    COALESCE(SUM(l."totalComision"),0)::numeric AS comisiones,
    COALESCE(SUM(l."totalNeto"),0)::numeric AS "netoLiquidado"
   FROM windows w LEFT JOIN "LiquidacionCanalExterno" l
    ON l."sucursalId"=w."sucursalId" AND l."creadaEn">=w.inicio
    AND l."creadaEn"<w.fin GROUP BY w."sucursalId"
  )
  SELECT v."sucursalId",v.ventas,v.ingresos::text AS ingresos,
   p.pagos,p.cobrado::text AS cobrado,
   r.reembolsos,r.reembolsado::text AS reembolsado,
   x.liquidaciones,x.comisiones::text AS comisiones,
   x."netoLiquidado"::text AS "netoLiquidado"
  FROM ventas v JOIN pagos p USING ("sucursalId")
   JOIN refunds r USING ("sucursalId") JOIN platforms x USING ("sucursalId")
  ORDER BY v."sucursalId"`);
 const index=new Map(rows.map(r=>[r.sucursalId,r]));
 const totals=new Map<string,{moneda:string;ventas:number;ingresos:Prisma.Decimal;
  pagos:number;cobrado:Prisma.Decimal;reembolsos:number;reembolsado:Prisma.Decimal;
  liquidaciones:number;comisiones:Prisma.Decimal;netoLiquidado:Prisma.Decimal}>();
 const data=branches.map(b=>{
  const r=index.get(b.id)??{sucursalId:b.id,ventas:0,ingresos:'0',
   pagos:0,cobrado:'0',reembolsos:0,reembolsado:'0',
   liquidaciones:0,comisiones:'0',netoLiquidado:'0'};
  let sum=totals.get(b.moneda);
  if(!sum){sum={moneda:b.moneda,ventas:0,ingresos:new Prisma.Decimal(0),
   pagos:0,cobrado:new Prisma.Decimal(0),reembolsos:0,
   reembolsado:new Prisma.Decimal(0),liquidaciones:0,
   comisiones:new Prisma.Decimal(0),netoLiquidado:new Prisma.Decimal(0)};
   totals.set(b.moneda,sum);}
  sum.ventas+=r.ventas;sum.ingresos=sum.ingresos.plus(r.ingresos);
  sum.pagos+=r.pagos;sum.cobrado=sum.cobrado.plus(r.cobrado);
  sum.reembolsos+=r.reembolsos;sum.reembolsado=sum.reembolsado.plus(r.reembolsado);
  sum.liquidaciones+=r.liquidaciones;
  sum.comisiones=sum.comisiones.plus(r.comisiones);
  sum.netoLiquidado=sum.netoLiquidado.plus(r.netoLiquidado);
  return {sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,
   periodo:{desde:b.desde,hasta:b.hasta,zonaHoraria:b.zonaHoraria,corte:b.corte},
   ventas:r.ventas,ingresos:currency(r.ingresos),pagos:r.pagos,
   cobrado:currency(r.cobrado),reembolsos:r.reembolsos,
   reembolsado:currency(r.reembolsado),liquidaciones:r.liquidaciones,
   comisiones:currency(r.comisiones),netoLiquidado:currency(r.netoLiquidado),
   diferenciaCobrosVsVentas:currency(new Prisma.Decimal(r.cobrado).minus(r.ingresos).toString())};
 });
 return {data,totalesPorMoneda:[...totals.values()].sort((a,b)=>a.moneda.localeCompare(b.moneda))
  .map(t=>({currency:t.moneda,ventas:t.ventas,ingresos:currency(t.ingresos.toString()),
   pagos:t.pagos,cobrado:currency(t.cobrado.toString()),reembolsos:t.reembolsos,
   reembolsado:currency(t.reembolsado.toString()),liquidaciones:t.liquidaciones,
   comisiones:currency(t.comisiones.toString()),
   netoLiquidado:currency(t.netoLiquidado.toString()),
   diferenciaCobrosVsVentas:currency(t.cobrado.minus(t.ingresos).toString())}))};
}
