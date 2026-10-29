import {createHash} from 'node:crypto';
import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {operationalDate} from '../../../payments/domain/payment.policy.js';
import {assertBankDate,assertStatementAmount,assertReversibleSource,bankExternalKey,financeReason} from '../../domain/bank-reconciliation.policy.js';
import type {BankQuery,BankImportInput,BankMatchInput,BankUnmatchInput,BankReverseInput} from '../../application/contracts/finance-bank.types.js';
type Tx=Prisma.TransactionClient;
const digest=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
@Injectable()
export class FinanceBankStore{
 constructor(private readonly db:PrismaService){}
 private async atomic<T>(run:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let retry=0;retry<3;retry++){
   try{return await this.db.$transaction(run,{isolationLevel:'Serializable',timeout:20000})}
   catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
     if(retry<2)continue;
     throw new ConflictException('Operación financiera en conflicto; consulte y reintente');
    }
    throw e;
   }
  }
  throw new ConflictException('Operación no disponible');
 }
 private async permission(tx:Tx,u:Principal,branch:string,code:string){
  const assigned=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   {sucursalId:branch,rol:{activo:true,alcance:'SUCURSAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}
  ]}});
  if(!assigned)throw new ForbiddenException('Permiso bancario insuficiente en sucursal');
 }
 private async account(tx:Tx,branch:string,accountId:string){
  const [account,sucursal]=await Promise.all([
   tx.cuentaFinanciera.findUnique({where:{id:accountId}}),
   tx.sucursal.findUnique({where:{id:branch},include:{configuracionSucursalesComoSucursal:true}})
  ]);
  if(!account||!account.activa||account.sucursalId!==branch||!sucursal?.activa||
   account.moneda!==(sucursal.configuracionSucursalesComoSucursal?.moneda??'GTQ'))
   throw new ConflictException('Cuenta bancaria no disponible en sucursal y moneda');
  return {account,sucursal};
 }
 private async once<T extends Record<string,unknown>>(tx:Tx,u:Principal,d:{sucursalId:string;operationId:string},
  accion:string,callback:()=>Promise<T>):Promise<T>{
  const intent=await tx.operacionIdempotente.findUnique({where:{clave:d.operationId}});
  if(!intent||intent.operacion!==accion||intent.hashSolicitud!==digest({
   usuarioId:u.id,sucursalId:d.sucursalId,accion
  }))throw new ConflictException('Intención financiera ajena a esta acción, usuario o sucursal');
  const payloadHash=digest({usuarioId:u.id,accion,input:d});
  if(intent.finalizada){
   const old=intent.resultado as {payloadHash?:string;value?:T}|null;
   if(!old||old.payloadHash!==payloadHash||!old.value)
    throw new ConflictException('Intención reutilizada con datos distintos');
   return old.value;
  }
  if(intent.expiraEn.getTime()<Date.now())throw new ConflictException('Intención financiera expirada');
  const value=await callback();
  await tx.operacionIdempotente.update({where:{clave:d.operationId},data:{
   finalizada:true,resultado:{payloadHash,value} as Prisma.InputJsonValue,
   expiraEn:new Date(Date.now()+365*86400000)
  }});
  return value;
 }
 private async event(tx:Tx,u:Principal,branch:string,action:string,kind:string,id:string,details:Record<string,unknown>){
  await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:branch,accion:action,
   entidad:kind,entidadId:id,despues:details as Prisma.InputJsonValue}});
  await tx.eventoOutbox.create({data:{tipo:action,agregado:kind,agregadoId:id,
   payload:{sucursalId:branch,...details} as Prisma.InputJsonValue}});
 }
 async list(u:Principal,q:BankQuery){
  return this.atomic(async tx=>{
   await this.permission(tx,u,q.sucursalId,'finance.statements.read');
   await this.account(tx,q.sucursalId,q.cuentaFinancieraId);
   const where:Prisma.LineaExtractoBancarioWhereInput={
    cuentaFinancieraId:q.cuentaFinancieraId,
    ...(q.estado?{movimientoFinancieroId:q.estado==='PENDIENTE'?null:{not:null}}:{})
   };
   const [rows,total]=await Promise.all([
    tx.lineaExtractoBancario.findMany({where,skip:(q.page-1)*q.limit,take:q.limit,
     orderBy:[{fecha:'desc'},{id:'desc'}]}),
    tx.lineaExtractoBancario.count({where})
   ]);
   return {data:rows.map(r=>({...r,monto:r.monto.toFixed(2),
    estado:r.movimientoFinancieroId?'CONCILIADO':'PENDIENTE'})),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)},
    nota:'Coincidencias de extracto verificadas manualmente; importación parcial no certifica saldo bancario'};
  });
 }
 async unmatched(u:Principal,q:BankQuery){
  return this.atomic(async tx=>{
   await this.permission(tx,u,q.sucursalId,'finance.statements.read');
   await this.account(tx,q.sucursalId,q.cuentaFinancieraId);
   const where:Prisma.MovimientoFinancieroWhereInput={
    cuentaId:q.cuentaFinancieraId,lineasExtractoComoMovimiento:{none:{}}
   };
   const [rows,total]=await Promise.all([
    tx.movimientoFinanciero.findMany({where,skip:(q.page-1)*q.limit,take:q.limit,
     orderBy:[{creadoEn:'desc'},{id:'desc'}]}),
    tx.movimientoFinanciero.count({where})
   ]);
   return {data:rows.map(r=>({id:r.id,referenciaTipo:r.referenciaTipo,
    referenciaId:r.referenciaId,monto:r.monto.toFixed(2),creadoEn:r.creadoEn})),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async importLines(u:Principal,d:BankImportInput){
  const keys=new Set<string>();
  for(const item of d.lineas){
   assertStatementAmount(item.monto);assertBankDate(item.fecha);
   const key=bankExternalKey(item.claveExterna);
   if(keys.has(key))throw new ConflictException('Línea de extracto duplicada en el lote');
   keys.add(key);
  }
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.statements.import');
   return this.once(tx,u,d,'FIN_STATEMENT_IMPORT',async()=>{
    await this.account(tx,d.sucursalId,d.cuentaFinancieraId);
    const existing=await tx.lineaExtractoBancario.count({where:{
     cuentaFinancieraId:d.cuentaFinancieraId,claveExterna:{in:[...keys]}}});
    if(existing)throw new ConflictException('Alguna clave del extracto ya fue importada');
    const rows=[];
    for(const l of d.lineas){
     const row=await tx.lineaExtractoBancario.create({data:{
      cuentaFinancieraId:d.cuentaFinancieraId,claveExterna:bankExternalKey(l.claveExterna),
      fecha:assertBankDate(l.fecha),monto:new Prisma.Decimal(l.monto),
      referencia:l.referencia?.trim(),descripcion:l.descripcion?.trim(),importadoPorId:u.id
     }});
     rows.push(row.id);
    }
    await this.event(tx,u,d.sucursalId,'FIN_STATEMENT_IMPORTED',
     'LineaExtractoBancario',rows[0],{cuentaId:d.cuentaFinancieraId,cantidad:rows.length});
    return {cuentaFinancieraId:d.cuentaFinancieraId,importadas:rows.length,lineaIds:rows};
   });
  });
 }
 async match(u:Principal,d:BankMatchInput){
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.statements.match');
   return this.once(tx,u,d,'FIN_STATEMENT_MATCH',async()=>{
    const row=await tx.lineaExtractoBancario.findUnique({where:{id:d.lineaId}});
    if(!row)throw new NotFoundException('Línea de extracto inexistente');
    await this.account(tx,d.sucursalId,row.cuentaFinancieraId);
    const movement=await tx.movimientoFinanciero.findUnique({where:{id:d.movimientoId}});
    if(!movement||movement.cuentaId!==row.cuentaFinancieraId)
     throw new ConflictException('Movimiento de otra cuenta o inexistente');
    if(row.movimientoFinancieroId)throw new ConflictException('Línea ya conciliada');
    if(!row.monto.eq(movement.monto))throw new ConflictException('Importes del extracto y asiento no coinciden');
    if(await tx.lineaExtractoBancario.count({where:{movimientoFinancieroId:movement.id}}))
     throw new ConflictException('Asiento ya conciliado con otra línea');
    const saved=await tx.lineaExtractoBancario.update({where:{id:row.id},data:{
     movimientoFinancieroId:movement.id,conciliadoPorId:u.id,conciliadoEn:new Date()
    }});
    await this.event(tx,u,d.sucursalId,'FIN_STATEMENT_MATCHED','LineaExtractoBancario',saved.id,
     {movimientoId:movement.id,cuentaId:row.cuentaFinancieraId,monto:row.monto.toFixed(2)});
    return {lineaId:saved.id,movimientoId:movement.id,estado:'CONCILIADO'};
   });
  });
 }
 async unmatch(u:Principal,d:BankUnmatchInput){
  const motivo=financeReason(d.motivo);
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.statements.match');
   return this.once(tx,u,d,'FIN_STATEMENT_UNMATCH',async()=>{
    const row=await tx.lineaExtractoBancario.findUnique({where:{id:d.lineaId}});
    if(!row)throw new NotFoundException('Línea inexistente');
    await this.account(tx,d.sucursalId,row.cuentaFinancieraId);
    if(!row.movimientoFinancieroId)throw new ConflictException('Línea no conciliada');
    const previous=row.movimientoFinancieroId;
    await tx.lineaExtractoBancario.update({where:{id:row.id},data:{
     movimientoFinancieroId:null,conciliadoPorId:null,conciliadoEn:null
    }});
    await this.event(tx,u,d.sucursalId,'FIN_STATEMENT_UNMATCHED','LineaExtractoBancario',row.id,
     {anteriorMovimientoId:previous,motivo});
    return {lineaId:row.id,estado:'PENDIENTE',movimientoAnteriorId:previous};
   });
  });
 }
 async reverse(u:Principal,d:BankReverseInput){
  const motivo=financeReason(d.motivo);
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.reversals.create');
   return this.once(tx,u,d,'FIN_LEDGER_REVERSE',async()=>{
    const orig=await tx.movimientoFinanciero.findUnique({where:{id:d.movimientoId}});
    if(!orig)throw new NotFoundException('Asiento original inexistente');
    const {sucursal}=await this.account(tx,d.sucursalId,orig.cuentaId);
    assertReversibleSource(orig.referenciaTipo);
    const currentDay=operationalDate(new Date(),sucursal.zonaHoraria,
     sucursal.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00');
    const closed=await tx.cierreOperativo.findUnique({where:{sucursalId_fechaOperativa:{
     sucursalId:d.sucursalId,fechaOperativa:currentDay}}});
    if(closed)throw new ConflictException('Período actual cerrado');
    if(await tx.lineaExtractoBancario.count({where:{movimientoFinancieroId:orig.id}}))
     throw new ConflictException('Desvincule primero el asiento del extracto conciliado');
    if(await tx.reversaFinanciera.findUnique({where:{movimientoOriginalId:orig.id}}))
     throw new ConflictException('El asiento ya tiene una reversa');
    const reversed=await tx.movimientoFinanciero.create({data:{
     cuentaId:orig.cuentaId,monto:orig.monto.neg(),referenciaTipo:'REVERSA_FINANCIERA',
     referenciaId:orig.id,descripcion:'Corrección financiera: '+motivo
    }});
    const reversal=await tx.reversaFinanciera.create({data:{
     sucursalId:d.sucursalId,movimientoOriginalId:orig.id,movimientoReversaId:reversed.id,
     motivo,usuarioId:u.id
    }});
    await this.event(tx,u,d.sucursalId,'FIN_LEDGER_REVERSED','ReversaFinanciera',reversal.id,
     {originalId:orig.id,reversaId:reversed.id,monto:reversed.monto.toFixed(2),motivo});
    return {reversaId:reversal.id,movimientoOriginalId:orig.id,
     movimientoReversaId:reversed.id,monto:reversed.monto.toFixed(2)};
   });
  });
 }
}
