import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {financialBusinessWindow} from '../../../finance/domain/operational-close.policy.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DailyReportPort,type DailyReportSnapshot} from '../../application/ports/daily-report.port.js';
import type {DailyReportQuery} from '../../application/contracts/daily-report.types.js';

type Tx=Prisma.TransactionClient;
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
// Fixed to the Guatemala wall clock regardless of the branch's own zonaHoraria/corte —
// see daily-report.types.ts. 'en-CA' formats as YYYY-MM-DD, which is what we store/compare.
function todayGuatemala():string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
@Injectable()
export class DailyReportStore extends DailyReportPort{
 constructor(private readonly db:PrismaService){super();}
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
 async snapshot(u:Principal,q:DailyReportQuery):Promise<DailyReportSnapshot>{
  const fecha=q.fecha??todayGuatemala();
  if(!datePattern.test(fecha))throw new BadRequestException('fecha inválida; use AAAA-MM-DD');
  return this.db.$transaction(async tx=>{
   const b=await this.branch(tx,u,q.sucursalId);
   const {from,to}=financialBusinessWindow(fecha,'America/Guatemala','00:00');
   const span={gte:from,lt:to};
   const [ventas,pagos,reembolsos,ordenesAbiertas,ordenesPorModalidad,cerradasHoy,canceladasHoy,
    ventasConCliente,entradas,salidas,gastos,turnosAgg,turnosAbiertos,movInventario,
    reservasPorEstado,reservasLlevadas]=
    await Promise.all([
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
    tx.orden.groupBy({by:['estado'],where:{sucursalId:b.id,abiertaEn:span},_count:{id:true}}),
    tx.orden.groupBy({by:['modalidad'],where:{sucursalId:b.id,abiertaEn:span},_count:{id:true}}),
    tx.orden.count({where:{sucursalId:b.id,cerradaEn:span}}),
    tx.orden.count({where:{sucursalId:b.id,canceladaEn:span}}),
    tx.venta.findMany({where:{sucursalId:b.id,cerradaEn:span,clienteId:{not:null}},
     select:{clienteId:true,total:true}}),
    tx.movimientoFinanciero.aggregate({where:{creadoEn:span,cuenta:{sucursalId:b.id},monto:{gt:0}},
     _sum:{monto:true}}),
    tx.movimientoFinanciero.aggregate({where:{creadoEn:span,cuenta:{sucursalId:b.id},monto:{lt:0}},
     _sum:{monto:true}}),
    tx.gastoOperativo.groupBy({by:['categoria'],where:{sucursalId:b.id,registradoEn:span},
     _sum:{monto:true}}),
    tx.turnoCaja.aggregate({
     where:{caja:{sucursalId:b.id},fechaOperativa:new Date(fecha+'T00:00:00.000Z')},
     _count:{id:true},_sum:{fondoInicial:true,efectivoEsperado:true,efectivoContado:true,diferencia:true}
    }),
    tx.turnoCaja.count({where:{caja:{sucursalId:b.id},
     fechaOperativa:new Date(fecha+'T00:00:00.000Z'),cerradaEn:null}}),
    tx.movimientoInventario.groupBy({by:['tipo'],
     where:{creadoEn:span,ubicacion:{almacen:{sucursalId:b.id}}},
     _sum:{cantidad:true,costoTotal:true}}),
    tx.reserva.groupBy({by:['estado'],where:{sucursalId:b.id,inicio:span},_count:{id:true}}),
    tx.reserva.findMany({where:{sucursalId:b.id,inicio:span,estado:{in:['CONFIRMADA','COMPLETADA']}},
     select:{id:true,nombreContacto:true,personas:true,inicio:true,estado:true},orderBy:{inicio:'asc'}})
   ]);
   const refundMap=new Map(reembolsos.map(x=>[x.metodo,dec(x.total)]));
   const porMetodoPago=pagos.map(p=>{
    const cobrado=dec(p._sum.monto),reembolsado=refundMap.get(p.metodo)??dec(0);
    return {metodo:p.metodo,cobrado:cobrado.toFixed(2),reembolsado:reembolsado.toFixed(2),
     neto:cobrado.minus(reembolsado).toFixed(2),cantidad:p._count.id};
   });
   // Customer breakdown is derived from today's sales at THIS branch (Cliente itself is
   // not branch-scoped — one customer can buy from several branches).
   const byClient=new Map<string,{total:Prisma.Decimal;ventas:number}>();
   for(const v of ventasConCliente){
    if(!v.clienteId)continue;
    const row=byClient.get(v.clienteId)??{total:dec(0),ventas:0};
    row.total=row.total.plus(dec(v.total));row.ventas++;
    byClient.set(v.clienteId,row);
   }
   const clienteIds=[...byClient.keys()];
   const [clientesInfo,clientesNuevos]=await Promise.all([
    clienteIds.length?tx.cliente.findMany({where:{id:{in:clienteIds}},select:{id:true,nombre:true}}):
     Promise.resolve([]),
    clienteIds.length?tx.cliente.count({where:{id:{in:clienteIds},creadoEn:span}}):Promise.resolve(0)
   ]);
   const nameOf=new Map(clientesInfo.map(c=>[c.id,c.nombre]));
   const topGasto=[...byClient.entries()].sort((a,b)=>b[1].total.comparedTo(a[1].total)).slice(0,5)
    .map(([clienteId,row])=>({clienteId,nombre:nameOf.get(clienteId)??'(sin nombre)',
     totalGastado:row.total.toFixed(2),cantidadVentas:row.ventas}));
   const consumo=await tx.movimientoInventario.aggregate({
    where:{creadoEn:span,ubicacion:{almacen:{sucursalId:b.id}},tipo:'CONSUMO'},_sum:{costoTotal:true}});
   const ventasNetas=dec(ventas._sum.total).minus(dec(ventas._sum.descuentoTotal));
   const costoConsumo=dec(consumo._sum.costoTotal).abs();
   // Top articles by movement value is a separate groupBy (the one above groups by tipo,
   // not articulo); ranking by absolute cost is done here since Prisma's groupBy cannot
   // orderBy an expression like ABS(costoTotal).
   const porArticulo=await tx.movimientoInventario.groupBy({by:['articuloId'],
    where:{creadoEn:span,ubicacion:{almacen:{sucursalId:b.id}}},_sum:{costoTotal:true}});
   const topArt=[...porArticulo].sort((a,b)=>
    dec(b._sum.costoTotal).abs().comparedTo(dec(a._sum.costoTotal).abs())).slice(0,10);
   const articuloNombres=topArt.length?await tx.articuloInventario.findMany(
    {where:{id:{in:topArt.map(x=>x.articuloId)}},select:{id:true,nombre:true}}):[];
   const nombreArticulo=new Map(articuloNombres.map(a=>[a.id,a.nombre]));
   return {
    sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,fecha,
    zonaHoraria:'America/Guatemala' as const,generatedAt:new Date().toISOString(),
    ventas:{totalBruto:money(ventas._sum.total),descuentos:money(ventas._sum.descuentoTotal),
     totalNeto:ventasNetas.toFixed(2),cantidadVentas:ventas._count.id,porMetodoPago},
    ordenes:{
     abiertasHoyPorEstado:ordenesAbiertas.map(o=>({estado:o.estado,cantidad:o._count.id})),
     cerradasHoy,canceladasHoy,
     porModalidad:ordenesPorModalidad.map(o=>({modalidad:o.modalidad,cantidad:o._count.id}))
    },
    clientes:{atendidosHoy:clienteIds.length,nuevosHoy:clientesNuevos,topGasto},
    ganancias:{ventasNetas:ventasNetas.toFixed(2),costoConsumoInventario:costoConsumo.toFixed(2),
     margenBrutoEstimado:ventasNetas.minus(costoConsumo).toFixed(2),
     nota:'Estimado: ventas netas del día menos el costo de consumo de inventario (recetas) '+
      'registrado ese día. No incluye gastos operativos, mano de obra ni otros costos indirectos.'},
    caja:{entradas:money(entradas._sum.monto),
     salidas:dec(salidas._sum.monto).abs().toFixed(2),
     gastosPorCategoria:gastos.map(g=>({categoria:g.categoria??'(sin categoría)',total:money(g._sum.monto)})),
     turnos:{total:turnosAgg._count.id,abiertos:turnosAbiertos,
      cerrados:turnosAgg._count.id-turnosAbiertos,
      fondoInicial:money(turnosAgg._sum.fondoInicial),
      efectivoEsperado:money(turnosAgg._sum.efectivoEsperado),
      efectivoContado:money(turnosAgg._sum.efectivoContado),
      diferencia:money(turnosAgg._sum.diferencia)}},
    inventario:{
     movimientosPorTipo:movInventario.map(m=>({tipo:m.tipo,cantidad:dec(m._sum.cantidad).toFixed(3),
      costoTotal:money(m._sum.costoTotal)})),
     topArticulos:topArt.map(a=>({articuloId:a.articuloId,
      nombre:nombreArticulo.get(a.articuloId)??'(desconocido)',
      costoTotalMovido:money(a._sum.costoTotal)}))
    },
    reservaciones:{
     porEstado:reservasPorEstado.map(r=>({estado:r.estado,cantidad:r._count.id})),
     llevadasACabo:reservasLlevadas.map(r=>({id:r.id,nombreContacto:r.nombreContacto,
      personas:r.personas,inicio:r.inicio.toISOString(),estado:r.estado}))
    }
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:20000});
 }
}
