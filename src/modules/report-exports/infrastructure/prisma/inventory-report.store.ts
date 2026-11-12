import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import {resolveSalesPeriod} from '../../domain/sales-period.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryReportPort,type InventoryReportSnapshot,type StockRow,type KardexLine}
 from '../../application/ports/inventory-report.port.js';
import type {InventoryReportQuery} from '../../application/contracts/inventory-report.types.js';

type Tx=Prisma.TransactionClient;
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);
function todayGuatemala():string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
@Injectable()
export class InventoryReportStore extends InventoryReportPort{
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
 async snapshot(u:Principal,q:InventoryReportQuery):Promise<InventoryReportSnapshot>{
  if(q.periodo==='PERSONALIZADO'&&(!q.desde||!q.hasta))
   throw new BadRequestException('Período personalizado requiere desde y hasta');
  const limite=Math.min(Math.max(q.limite??500,1),2000);
  return this.db.$transaction(async tx=>{
   const b=await this.branch(tx,u,q.sucursalId);
   const period=resolveSalesPeriod(q,todayGuatemala());
   const from=financialBusinessWindow(period.desde,'America/Guatemala','00:00').from;
   const to=financialBusinessWindow(period.hasta,'America/Guatemala','00:00').to;

   // Stock actual is always NOW, independent of the selected period: Existencia is live
   // state, the system keeps no historical daily stock snapshots — only the movement
   // ledger below is period-bound. Noted in the report itself, not just here.
   const stockRaw=await tx.$queryRaw<Array<{articuloId:string;cantidad:string;valor:string}>>`
     SELECT e."articuloId", SUM(e.cantidad)::text AS cantidad,
      SUM(e.cantidad*e."costoPromedio")::text AS valor
     FROM "Existencia" e
      JOIN "UbicacionAlmacen" u ON u.id=e."ubicacionId"
      JOIN "Almacen" a ON a.id=u."almacenId"
     WHERE a."sucursalId"=${b.id}
     GROUP BY e."articuloId"
     ORDER BY valor DESC
     LIMIT ${limite}`;
   const articuloIds=stockRaw.map(s=>s.articuloId);
   const articulos=articuloIds.length?await tx.articuloInventario.findMany(
    {where:{id:{in:articuloIds}},select:{id:true,nombre:true,tipo:true}}):[];
   const articuloInfo=new Map(articulos.map(a=>[a.id,a]));
   const stockActual:StockRow[]=stockRaw.map(s=>({articuloId:s.articuloId,
    nombre:articuloInfo.get(s.articuloId)?.nombre??'(desconocido)',
    tipo:articuloInfo.get(s.articuloId)?.tipo??'',
    cantidadActual:dec(s.cantidad).toFixed(3),valorActual:money(s.valor)}));
   const valorTotal=await tx.$queryRaw<Array<{total:string}>>`
     SELECT COALESCE(SUM(e.cantidad*e."costoPromedio"),0)::text AS total
     FROM "Existencia" e JOIN "UbicacionAlmacen" u ON u.id=e."ubicacionId"
      JOIN "Almacen" a ON a.id=u."almacenId" WHERE a."sucursalId"=${b.id}`;
   const articulosConStockTotal=await tx.$queryRaw<Array<{n:number}>>`
     SELECT COUNT(DISTINCT e."articuloId")::int AS n
     FROM "Existencia" e JOIN "UbicacionAlmacen" u ON u.id=e."ubicacionId"
      JOIN "Almacen" a ON a.id=u."almacenId" WHERE a."sucursalId"=${b.id} AND e.cantidad<>0`;

   const [movPorTipo,porArticulo,kardexRaw]=await Promise.all([
    tx.movimientoInventario.groupBy({by:['tipo'],
     where:{creadoEn:{gte:from,lt:to},ubicacion:{almacen:{sucursalId:b.id}}},
     _sum:{cantidad:true,costoTotal:true}}),
    tx.movimientoInventario.groupBy({by:['articuloId'],
     where:{creadoEn:{gte:from,lt:to},ubicacion:{almacen:{sucursalId:b.id}}},_sum:{costoTotal:true}}),
    tx.$queryRaw<Array<{fecha:Date;articulo:string;tipo:string;cantidad:string;
     costoUnitario:string;costoTotal:string;referenciaTipo:string;nota:string}>>`
      SELECT m."creadoEn" AS fecha, art.nombre AS articulo, m.tipo::text AS tipo,
       m.cantidad::text AS cantidad, m."costoUnitario"::text AS "costoUnitario",
       m."costoTotal"::text AS "costoTotal", m."referenciaTipo" AS "referenciaTipo",
       COALESCE(m.nota,'') AS nota
      FROM "MovimientoInventario" m
       JOIN "UbicacionAlmacen" u ON u.id=m."ubicacionId"
       JOIN "Almacen" a ON a.id=u."almacenId"
       JOIN "ArticuloInventario" art ON art.id=m."articuloId"
      WHERE a."sucursalId"=${b.id} AND m."creadoEn">=${from} AND m."creadoEn"<${to}
      ORDER BY m."creadoEn" ASC
      LIMIT ${limite+1}`
   ]);
   const topArt=[...porArticulo].sort((x,y)=>
    dec(y._sum.costoTotal).abs().comparedTo(dec(x._sum.costoTotal).abs())).slice(0,15);
   const topArtIds=topArt.map(a=>a.articuloId);
   const topArtInfo=topArtIds.length?await tx.articuloInventario.findMany(
    {where:{id:{in:topArtIds}},select:{id:true,nombre:true}}):[];
   const topArtNombre=new Map(topArtInfo.map(a=>[a.id,a.nombre]));
   // Soft cap, not a hard error: limite itself is already bounded to 2000 by the DTO, so
   // the largest possible fetch (limite+1) carries no real resource risk. Truncation is
   // surfaced to the caller as a flag (kardexTruncado) instead of failing the request —
   // the admin can always narrow the period or raise limite if they need everything.
   const kardexTruncado=kardexRaw.length>limite;
   const kardex:KardexLine[]=kardexRaw.slice(0,limite).map(k=>({
    fecha:k.fecha.toISOString(),articulo:k.articulo,tipo:k.tipo,cantidad:dec(k.cantidad).toFixed(3),
    costoUnitario:money(k.costoUnitario),costoTotal:money(k.costoTotal),
    referenciaTipo:k.referenciaTipo,nota:k.nota}));
   return {
    sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,
    periodo:{tipo:q.periodo,desde:period.desde,hasta:period.hasta},
    generatedAt:new Date().toISOString(),
    resumen:{articulosConStock:articulosConStockTotal[0]?.n??0,
     valorTotalInventario:money(valorTotal[0]?.total),
     movimientosPorTipo:movPorTipo.map(m=>({tipo:m.tipo,cantidad:dec(m._sum.cantidad).toFixed(3),
      costoTotal:money(m._sum.costoTotal)}))},
    stockActual,
    topMovidos:topArt.map(a=>({articuloId:a.articuloId,
     nombre:topArtNombre.get(a.articuloId)??'(desconocido)',costoTotalMovido:money(a._sum.costoTotal)})),
    kardex,kardexTruncado
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:20000});
 }
}
