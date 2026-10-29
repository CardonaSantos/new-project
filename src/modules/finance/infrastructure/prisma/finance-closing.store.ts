import {createHash} from 'node:crypto';
import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {operationalDate} from '../../../payments/domain/payment.policy.js';
import {ensureCloseEligible,financialBusinessWindow} from '../../domain/operational-close.policy.js';
import type {ClosePreviewQuery,CloseConfirmInput} from '../../application/contracts/finance-closing.types.js';
type Tx=Prisma.TransactionClient;
const sum=(d:Prisma.Decimal|null|undefined)=>(d??new Prisma.Decimal(0)).toFixed(2);
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
@Injectable()
export class FinanceClosingStore{
 constructor(private readonly db:PrismaService){}
 private async transaction<T>(run:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let i=0;i<3;i++){
   try{return await this.db.$transaction(run,{isolationLevel:'Serializable',timeout:20000})}
   catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
     if(i<2)continue;
     throw new ConflictException('Cierre concurrente; consulte el estado del día');
    }
    throw e;
   }
  }
  throw new ConflictException('No se pudo completar el cierre');
 }
 private async permission(tx:Tx,u:Principal,branch:string,code:string){
  const access=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}
  ]}});
  if(!access)throw new ForbiddenException('Permiso de cierre insuficiente en sucursal');
 }
 private async summary(tx:Tx,q:ClosePreviewQuery){
  const branch=await tx.sucursal.findUnique({where:{id:q.sucursalId},
   include:{configuracionSucursalesComoSucursal:true}});
  if(!branch?.activa)throw new ConflictException('Sucursal inactiva');
  const cut=branch.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00';
  const {date,from,to}=financialBusinessWindow(q.fechaOperativa,branch.zonaHoraria,cut);
  const span={gte:from,lt:to};
  const [shifts,openOrders,paid,refunded,suppliers,expenses,sales]=await Promise.all([
   tx.turnoCaja.findMany({where:{fechaOperativa:date,caja:{sucursalId:q.sucursalId}},
    select:{id:true,cajaId:true,cerradaEn:true,fondoInicial:true,
     efectivoEsperado:true,efectivoContado:true,diferencia:true}}),
   tx.orden.count({where:{sucursalId:q.sucursalId,estado:'ABIERTA',abiertaEn:{lt:to}}}),
   tx.pago.aggregate({where:{cobradoEn:span,cuenta:{orden:{sucursalId:q.sucursalId}}},
    _sum:{monto:true},_count:{id:true}}),
   tx.reembolsoPago.aggregate({where:{creadoEn:span,pago:{cuenta:{orden:{sucursalId:q.sucursalId}}}},
    _sum:{monto:true},_count:{id:true}}),
   tx.pagoProveedor.aggregate({where:{confirmadoEn:span,sucursalId:q.sucursalId,estado:'CONFIRMADO'},
    _sum:{monto:true},_count:{id:true}}),
   tx.gastoOperativo.aggregate({where:{registradoEn:span,sucursalId:q.sucursalId},
    _sum:{monto:true},_count:{id:true}}),
   tx.venta.aggregate({where:{cerradaEn:span,sucursalId:q.sucursalId},
    _sum:{total:true},_count:{id:true}})
  ]);
  const cashMoves=shifts.length?await tx.movimientoCaja.groupBy({
   by:['tipo'],where:{turnoId:{in:shifts.map(s=>s.id)}},
   _sum:{monto:true},_count:{id:true}
  }):[];
  const incoming=cashMoves.find(m=>m.tipo==='INGRESO'),outgoing=cashMoves.find(m=>m.tipo==='EGRESO');
  const dayNow=operationalDate(new Date(),branch.zonaHoraria,cut);
  const openShifts=shifts.filter(s=>!s.cerradaEn).length;
  const diff=shifts.reduce((value,s)=>value.plus(s.diferencia??0),new Prisma.Decimal(0));
  const canClose=date<dayNow&&openShifts===0&&openOrders===0;
  return {sucursalId:q.sucursalId,fechaOperativa:q.fechaOperativa,
   zonaHoraria:branch.zonaHoraria,horaCorteOperativo:cut,
   periodoUtc:{desde:from.toISOString(),hastaExclusivo:to.toISOString()},
   ventas:{cantidad:sales._count.id,total:sum(sales._sum.total)},
   cobros:{cantidad:paid._count.id,total:sum(paid._sum.monto)},
   reembolsos:{cantidad:refunded._count.id,total:sum(refunded._sum.monto)},
   pagosProveedor:{cantidad:suppliers._count.id,total:sum(suppliers._sum.monto)},
   gastosOperativos:{cantidad:expenses._count.id,total:sum(expenses._sum.monto)},
   caja:{turnos:shifts.length,turnosAbiertos:openShifts,
    ingresos:sum(incoming?._sum.monto),egresos:sum(outgoing?._sum.monto),
    diferenciaArqueo:diff.toFixed(2)},
   ordenesAbiertas:openOrders,puedeCerrar:canClose,
   advertencias:[...(date>=dayNow?['El día operativo todavía no ha terminado']:[]),
    ...(openShifts?['Hay turnos sin cerrar']:[]),
    ...(openOrders?['Hay órdenes abiertas anteriores al fin del período']:[])],
   nota:'Cierre de operación por fecha local; no certifica conciliación con extractos bancarios'};
 }
 async preview(u:Principal,q:ClosePreviewQuery){
  return this.transaction(async tx=>{
   await this.permission(tx,u,q.sucursalId,'finance.closing.read');
   const closed=await tx.cierreOperativo.findUnique({where:{sucursalId_fechaOperativa:{
    sucursalId:q.sucursalId,fechaOperativa:new Date(q.fechaOperativa+'T00:00:00.000Z')}}});
   if(closed)return {cerrado:true,cierreId:closed.id,resumen:closed.resumen,cerradoEn:closed.cerradoEn};
   return {cerrado:false,resumen:await this.summary(tx,q)};
  });
 }
 async detail(u:Principal,sucursalId:string,fechaOperativa:string){
  return this.transaction(async tx=>{
   await this.permission(tx,u,sucursalId,'finance.closing.read');
   const row=await tx.cierreOperativo.findUnique({where:{sucursalId_fechaOperativa:{
    sucursalId,fechaOperativa:new Date(fechaOperativa+'T00:00:00.000Z')}}});
   if(!row)throw new NotFoundException('No existe cierre de esta fecha');
   return {id:row.id,sucursalId,fechaOperativa,cerradoEn:row.cerradoEn,
    cerradoPorId:row.usuarioId,resumen:row.resumen};
  });
 }
 async confirm(u:Principal,d:CloseConfirmInput){
  return this.transaction(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.closing.execute');
   const operation=await tx.operacionIdempotente.findUnique({where:{clave:d.operationId}});
   if(!operation||operation.operacion!=='FIN_DAY_CLOSE'||
    operation.hashSolicitud!==hash({usuarioId:u.id,sucursalId:d.sucursalId,accion:'FIN_DAY_CLOSE'}))
    throw new ConflictException('Intención de cierre inexistente o ajena a la sucursal');
   const requestHash=hash({usuarioId:u.id,accion:'FIN_DAY_CLOSE',input:d});
   if(operation.finalizada){
    const old=operation.resultado as {payloadHash?:string;value?:unknown}|null;
    if(!old||old.payloadHash!==requestHash)throw new ConflictException('Cierre reutilizado con datos distintos');
    return old.value;
   }
   if(operation.expiraEn.getTime()<Date.now())throw new ConflictException('Intención de cierre expirada');
   const existing=await tx.cierreOperativo.findUnique({where:{sucursalId_fechaOperativa:{
    sucursalId:d.sucursalId,fechaOperativa:new Date(d.fechaOperativa+'T00:00:00.000Z')}}});
   if(existing)throw new ConflictException('El día ya está cerrado');
   const resumen=await this.summary(tx,d);
   ensureCloseEligible(new Date(d.fechaOperativa+'T00:00:00.000Z'),
    operationalDate(new Date(),resumen.zonaHoraria,resumen.horaCorteOperativo),
    resumen.caja.turnosAbiertos,resumen.ordenesAbiertas);
   const closed=await tx.cierreOperativo.create({data:{
    sucursalId:d.sucursalId,fechaOperativa:new Date(d.fechaOperativa+'T00:00:00.000Z'),
    usuarioId:u.id,resumen:resumen as Prisma.InputJsonValue
   }});
   const result={id:closed.id,sucursalId:d.sucursalId,fechaOperativa:d.fechaOperativa,
    cerradoEn:closed.cerradoEn,resumen:closed.resumen};
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:d.sucursalId,
    accion:'FIN_DAY_CLOSED',entidad:'CierreOperativo',entidadId:closed.id,
    despues:{fechaOperativa:d.fechaOperativa,versionResumen:1}}});
   await tx.eventoOutbox.create({data:{tipo:'FIN_DAY_CLOSED',agregado:'CierreOperativo',
    agregadoId:closed.id,payload:{sucursalId:d.sucursalId,fechaOperativa:d.fechaOperativa}}});
   await tx.operacionIdempotente.update({where:{clave:d.operationId},data:{
    finalizada:true,resultado:{payloadHash:requestHash,value:result} as Prisma.InputJsonValue,
    expiraEn:new Date(Date.now()+365*86400000)
   }});
   return result;
  });
 }
}
