import {ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CustomerReportPort,type CustomerReportSnapshot,type CustomerReportRow}
 from '../../application/ports/customer-report.port.js';
import type {CustomerReportQuery} from '../../application/contracts/customer-report.types.js';

type Tx=Prisma.TransactionClient;
const dec=(x:Prisma.Decimal|string|number|null|undefined)=>new Prisma.Decimal(x??0);
const money=(x:Prisma.Decimal|string|number|null|undefined)=>dec(x).toFixed(2);

@Injectable()
export class CustomerReportStore extends CustomerReportPort{
 constructor(private readonly db:PrismaService){super();}
 // Same reports.read permission check as the other report-exports stores (daily-report,
 // sales-report); duplicated on purpose — see report-exports.module.ts.
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
 async snapshot(u:Principal,q:CustomerReportQuery):Promise<CustomerReportSnapshot>{
  const soloActivos=q.soloActivos??false;
  const limite=Math.min(Math.max(q.limite??500,1),2000);
  return this.db.$transaction(async tx=>{
   const b=await this.branch(tx,u,q.sucursalId);
   // "Clientes de esta sucursal" = visibilidad vía ClienteSucursal (DEL-A), no inferida
   // de las ventas — un cliente puede estar dado de alta en la sucursal sin haber
   // comprado todavía, y eso también le importa al administrador.
   const vinculos=await tx.clienteSucursal.findMany({where:{sucursalId:b.id},
    select:{cliente:{select:{id:true,nombre:true,nit:true,telefono:true,email:true,
     notas:true,activo:true,creadoEn:true}}}});
   let clientes=vinculos.map(v=>v.cliente);
   if(soloActivos)clientes=clientes.filter(c=>c.activo);
   const clienteIds=clientes.map(c=>c.id);
   if(!clienteIds.length){
    return {sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,generatedAt:new Date().toISOString(),
     filtros:{soloActivos,limite},
     resumen:{totalClientes:0,clientesActivos:0,clientesInactivos:0,clientesConCompras:0},
     clientes:[]};
   }
   const [ventasPorCliente,direcciones,ordenesPorCliente,ordenesCanceladasPorCliente,
    reservasPorCliente,reservasNoAsistioPorCliente]=await Promise.all([
    tx.venta.groupBy({by:['clienteId'],where:{sucursalId:b.id,clienteId:{in:clienteIds}},
     _sum:{total:true,descuentoTotal:true},_count:{id:true},_min:{cerradaEn:true},_max:{cerradaEn:true}}),
    tx.direccionCliente.findMany({where:{clienteId:{in:clienteIds}},
     select:{clienteId:true,alias:true,direccion:true,principal:true,activa:true}}),
    tx.orden.groupBy({by:['clienteId'],where:{sucursalId:b.id,clienteId:{in:clienteIds}},_count:{id:true}}),
    tx.orden.groupBy({by:['clienteId'],
     where:{sucursalId:b.id,clienteId:{in:clienteIds},estado:'CANCELADA'},_count:{id:true}}),
    tx.reserva.groupBy({by:['clienteId'],where:{sucursalId:b.id,clienteId:{in:clienteIds}},_count:{id:true}}),
    tx.reserva.groupBy({by:['clienteId'],
     where:{sucursalId:b.id,clienteId:{in:clienteIds},estado:'NO_ASISTIO'},_count:{id:true}})
   ]);
   const ventasMap=new Map(ventasPorCliente.map(v=>[v.clienteId,v]));
   const ordenesMap=new Map(ordenesPorCliente.map(o=>[o.clienteId,o._count.id]));
   const ordenesCanceladasMap=new Map(ordenesCanceladasPorCliente.map(o=>[o.clienteId,o._count.id]));
   const reservasMap=new Map(reservasPorCliente.map(r=>[r.clienteId,r._count.id]));
   const noAsistioMap=new Map(reservasNoAsistioPorCliente.map(r=>[r.clienteId,r._count.id]));
   const direccionesPorCliente=new Map<string,{alias:string|null;direccion:string;principal:boolean}[]>();
   for(const d of direcciones){
    if(!d.activa)continue;
    const list=direccionesPorCliente.get(d.clienteId)??[];
    list.push({alias:d.alias,direccion:d.direccion,principal:d.principal});
    direccionesPorCliente.set(d.clienteId,list);
   }
   const rows:CustomerReportRow[]=clientes.map(c=>{
    const v=ventasMap.get(c.id);
    const bruto=dec(v?._sum.total),desc=dec(v?._sum.descuentoTotal),neto=bruto.minus(desc);
    const cantidadVentas=v?._count.id??0;
    const direccionesCliente=direccionesPorCliente.get(c.id)??[];
    const principal=direccionesCliente.find(d=>d.principal)??direccionesCliente[0];
    return {
     clienteId:c.id,nombre:c.nombre,nit:c.nit??'',telefono:c.telefono??'',email:c.email??'',
     activo:c.activo,registradoEn:c.creadoEn.toISOString(),notas:c.notas??'',
     direccionPrincipal:principal?(principal.alias?principal.alias+': ':'')+principal.direccion:'',
     cantidadDirecciones:direccionesCliente.length,
     cantidadVentas,totalGastado:money(neto),
     ticketPromedio:cantidadVentas?neto.div(cantidadVentas).toFixed(2):'0.00',
     primeraCompra:v?._min.cerradaEn?.toISOString()??'',ultimaCompra:v?._max.cerradaEn?.toISOString()??'',
     cantidadOrdenes:ordenesMap.get(c.id)??0,ordenesCanceladas:ordenesCanceladasMap.get(c.id)??0,
     cantidadReservas:reservasMap.get(c.id)??0,reservasNoAsistio:noAsistioMap.get(c.id)??0
    };
   }).sort((a,b2)=>Number(b2.totalGastado)-Number(a.totalGastado)).slice(0,limite);
   return {
    sucursal:{id:b.id,nombre:b.nombre},currency:b.moneda,generatedAt:new Date().toISOString(),
    filtros:{soloActivos,limite},
    resumen:{totalClientes:clientes.length,
     clientesActivos:clientes.filter(c=>c.activo).length,
     clientesInactivos:clientes.filter(c=>!c.activo).length,
     clientesConCompras:ventasPorCliente.length},
    clientes:rows
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:20000});
 }
}
