import {Injectable} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {UserActivityPort,type DateRange,type ActivityItem} from '../../application/ports/user-activity.port.js';

@Injectable()
export class PrismaUserActivityRepository extends UserActivityPort {
 constructor(private readonly db:PrismaService){super();}
 async overview(userId:string,r:DateRange){
  const branch=r.sucursalId;
  const orders={usuarioId:userId,abiertaEn:{gte:r.from,lt:r.to},
   ...(branch?{sucursalId:branch}:{})};
  const payments={cobradoPorId:userId,cobradoEn:{gte:r.from,lt:r.to},
   ...(branch?{cuenta:{orden:{sucursalId:branch}}}:{})};
  const cash={cajeroId:userId,abiertaEn:{gte:r.from,lt:r.to},
   ...(branch?{caja:{sucursalId:branch}}:{})};
  const delivery={repartidorId:userId,
   ...(branch?{orden:{sucursalId:branch}}:{})};
  const inventory={usuarioId:userId,creadoEn:{gte:r.from,lt:r.to},
   ...(branch?{ubicacion:{almacen:{sucursalId:branch}}}:{})};
  const [o,oClosed,p,c,cOpen,d,dDone,i]=await Promise.all([
   this.db.orden.aggregate({where:orders,_count:{_all:true},_sum:{total:true}}),
   this.db.orden.count({where:{...orders,estado:'CERRADA'}}),
   this.db.pago.aggregate({where:payments,_count:{_all:true},_sum:{monto:true}}),
   this.db.turnoCaja.count({where:cash}),
   this.db.turnoCaja.count({where:{...cash,cerradaEn:null}}),
   this.db.entrega.count({where:{...delivery,enRepartoEn:{gte:r.from,lt:r.to}}}),
   this.db.entrega.count({where:{...delivery,estado:'ENTREGADA',entregadaEn:{gte:r.from,lt:r.to}}}),
   this.db.movimientoInventario.count({where:inventory})
  ]);
  return {desde:r.from.toISOString(),hasta:r.to.toISOString(),sucursalId:branch,
   ordenes:{total:o._count._all,cerradas:oClosed,importeOrdenes:o._sum.total?.toFixed(2)??'0.00'},
   cobros:{cantidad:p._count._all,importeCobrado:p._sum.monto?.toFixed(2)??'0.00'},
   caja:{turnos:c,abiertos:cOpen},delivery:{entregas:d,completadas:dDone},
   inventario:{movimientos:i}};
 }
 async activity(userId:string,r:DateRange,f:{page:number;limit:number;kind?:ActivityItem['kind']}){
  const take=Math.min(f.page*f.limit,5000),branch=r.sucursalId;
  const enabled=(k:ActivityItem['kind'])=>!f.kind||f.kind===k;
  const [o,p,c,d,i]=await Promise.all([
   enabled('ORDEN')?this.db.orden.findMany({where:{usuarioId:userId,abiertaEn:{gte:r.from,lt:r.to},
    ...(branch?{sucursalId:branch}:{})},orderBy:{abiertaEn:'desc'},take}):Promise.resolve([]),
   enabled('PAGO')?this.db.pago.findMany({where:{cobradoPorId:userId,cobradoEn:{gte:r.from,lt:r.to},
    ...(branch?{cuenta:{orden:{sucursalId:branch}}}:{})},orderBy:{cobradoEn:'desc'},take,
    include:{cuenta:{include:{orden:{select:{sucursalId:true}}}}}}):Promise.resolve([]),
   enabled('CAJA')?this.db.turnoCaja.findMany({where:{cajeroId:userId,abiertaEn:{gte:r.from,lt:r.to},
    ...(branch?{caja:{sucursalId:branch}}:{})},orderBy:{abiertaEn:'desc'},take,
    include:{caja:{select:{sucursalId:true}}}}):Promise.resolve([]),
   enabled('ENTREGA')?this.db.entrega.findMany({where:{repartidorId:userId,
    enRepartoEn:{gte:r.from,lt:r.to},...(branch?{orden:{sucursalId:branch}}:{})},
    orderBy:{enRepartoEn:'desc'},take,include:{orden:{select:{sucursalId:true}}}}):Promise.resolve([]),
   enabled('INVENTARIO')?this.db.movimientoInventario.findMany({where:{usuarioId:userId,
    creadoEn:{gte:r.from,lt:r.to},...(branch?{ubicacion:{almacen:{sucursalId:branch}}}:{})},
    orderBy:{creadoEn:'desc'},take,include:{ubicacion:{include:{almacen:{select:{sucursalId:true}}}}}}):Promise.resolve([])
  ]);
  const entries:ActivityItem[]=[
   ...o.map(x=>({id:x.id,kind:'ORDEN' as const,at:x.abiertaEn.toISOString(),
    label:'Orden '+x.numero,status:x.estado,amount:x.total.toFixed(2),sucursalId:x.sucursalId})),
   ...p.map(x=>({id:x.id,kind:'PAGO' as const,at:x.cobradoEn.toISOString(),
    label:'Cobro '+x.metodo,status:null,amount:x.monto.toFixed(2),sucursalId:x.cuenta.orden.sucursalId})),
   ...c.map(x=>({id:x.id,kind:'CAJA' as const,at:x.abiertaEn.toISOString(),
    label:'Turno de caja',status:x.cerradaEn?'CERRADO':'ABIERTO',
    amount:x.efectivoContado?.toFixed(2)??null,sucursalId:x.caja.sucursalId})),
   ...d.filter(x=>x.enRepartoEn).map(x=>({id:x.id,kind:'ENTREGA' as const,at:x.enRepartoEn!.toISOString(),
    label:'Entrega',status:x.estado,amount:x.costoEnvio.toFixed(2),sucursalId:x.orden.sucursalId})),
   ...i.map(x=>({id:x.id,kind:'INVENTARIO' as const,at:x.creadoEn.toISOString(),
    label:'Movimiento de inventario',status:x.tipo,amount:null,sucursalId:x.ubicacion.almacen.sucursalId}))
  ];
  entries.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
  const start=(f.page-1)*f.limit;
  const [on,pn,cn,dn,invn]=await Promise.all([
   enabled('ORDEN')?this.db.orden.count({where:{usuarioId:userId,abiertaEn:{gte:r.from,lt:r.to},
    ...(branch?{sucursalId:branch}:{})}}):Promise.resolve(0),
   enabled('PAGO')?this.db.pago.count({where:{cobradoPorId:userId,cobradoEn:{gte:r.from,lt:r.to},
    ...(branch?{cuenta:{orden:{sucursalId:branch}}}:{})}}):Promise.resolve(0),
   enabled('CAJA')?this.db.turnoCaja.count({where:{cajeroId:userId,abiertaEn:{gte:r.from,lt:r.to},
    ...(branch?{caja:{sucursalId:branch}}:{})}}):Promise.resolve(0),
   enabled('ENTREGA')?this.db.entrega.count({where:{repartidorId:userId,enRepartoEn:{gte:r.from,lt:r.to},
    ...(branch?{orden:{sucursalId:branch}}:{})}}):Promise.resolve(0),
   enabled('INVENTARIO')?this.db.movimientoInventario.count({where:{usuarioId:userId,creadoEn:{gte:r.from,lt:r.to},
    ...(branch?{ubicacion:{almacen:{sucursalId:branch}}}:{})}}):Promise.resolve(0)
  ]);
  const total=on+pn+cn+dn+invn;
  return {data:entries.slice(start,start+f.limit),meta:{
   page:f.page,limit:f.limit,total,totalPages:Math.ceil(total/f.limit)}};
 }
 async report(r:DateRange,f:{page:number;limit:number}){
  const where={...(r.sucursalId?{usuarioRolesComoUsuario:{some:{sucursalId:r.sucursalId}}}:{})};
  const [users,total]=await Promise.all([
   this.db.usuario.findMany({where,select:{id:true,nombre:true,perfil:{select:{apellidos:true}}},
    orderBy:{nombre:'asc'},skip:(f.page-1)*f.limit,take:f.limit}),
   this.db.usuario.count({where})
  ]);
  const ids=users.map(x=>x.id);
  const [orders,payments]=await Promise.all([
   this.db.orden.groupBy({by:['usuarioId'],where:{usuarioId:{in:ids},
    abiertaEn:{gte:r.from,lt:r.to},...(r.sucursalId?{sucursalId:r.sucursalId}:{})},
    _count:{_all:true}}),
   this.db.pago.groupBy({by:['cobradoPorId'],where:{cobradoPorId:{in:ids},
    cobradoEn:{gte:r.from,lt:r.to},...(r.sucursalId?{cuenta:{orden:{sucursalId:r.sucursalId}}}:{})},
    _count:{_all:true},_sum:{monto:true}})
  ]);
  const o=new Map(orders.map(x=>[x.usuarioId,x._count._all]));
  const p=new Map(payments.map(x=>[x.cobradoPorId,x]));
  return {data:users.map(x=>({
   usuarioId:x.id,nombre:[x.nombre,x.perfil?.apellidos].filter(Boolean).join(' '),
   ordenes:o.get(x.id)??0,cobros:p.get(x.id)?._count._all??0,
   importeCobrado:p.get(x.id)?._sum.monto?.toFixed(2)??'0.00'
  })),meta:{page:f.page,limit:f.limit,total,totalPages:Math.ceil(total/f.limit)}};
 }
}
