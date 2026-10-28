import {createHash} from 'node:crypto';
import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../generated/prisma/client.js';
import {PrismaService} from '../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../auth/application/auth.service.js';
import type {FinanceAccountCreateDto,FinanceAccountQueryDto,FinanceMovementQueryDto} from './finance.dto.js';

type Tx=Prisma.TransactionClient;
@Injectable()
export class FinanceStore{
 constructor(private readonly db:PrismaService){}
 private async atomic<T>(run:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<3;attempt++){
   try{return await this.db.$transaction(run,{isolationLevel:'Serializable',timeout:20000});}
   catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code)){
     if(attempt<2)continue;
     throw new ConflictException('Conflicto concurrente; revise el estado y reintente');
    }
    throw e;
   }
  }
  throw new ConflictException('No se pudo completar la operación');
 }
 private async permission(tx:Tx,user:Principal,branchId:string,code:string){
  const granted=await tx.usuarioRol.findFirst({where:{usuarioId:user.id,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   {sucursalId:branchId,rol:{activo:true,alcance:'SUCURSAL',
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}
  ]}});
  if(!granted)throw new ForbiddenException('Permiso financiero insuficiente en sucursal');
 }
 private async activeBranch(tx:Tx,id:string){
  const branch=await tx.sucursal.findUnique({where:{id},
   include:{configuracionSucursalesComoSucursal:true}});
  if(!branch?.activa)throw new ConflictException('Sucursal no disponible');
  return branch;
 }
 private async accountRow(tx:Tx,id:string){
  const row=await tx.cuentaFinanciera.findUnique({where:{id}});
  if(!row||!row.sucursalId)throw new NotFoundException('Cuenta financiera de sucursal inexistente');
  return row;
 }
 private shapeAccount(row:{id:string;sucursalId:string|null;nombre:string;tipo:string;moneda:string;activa:boolean},sum:Prisma.Decimal|null){
  return {id:row.id,sucursalId:row.sucursalId,nombre:row.nombre,tipo:row.tipo,
   moneda:row.moneda,activa:row.activa,saldoRegistrado:(sum??new Prisma.Decimal(0)).toFixed(2)};
 }
 async accounts(u:Principal,q:FinanceAccountQueryDto){
  return this.atomic(async tx=>{
   await this.permission(tx,u,q.sucursalId,'finance.read');
   const where={sucursalId:q.sucursalId};
   const [rows,total]=await Promise.all([
    tx.cuentaFinanciera.findMany({where,orderBy:[{nombre:'asc'},{id:'asc'}],
     skip:(q.page-1)*q.limit,take:q.limit}),
    tx.cuentaFinanciera.count({where})
   ]);
   const ids=rows.map(x=>x.id);
   const totals=ids.length?await tx.movimientoFinanciero.groupBy({
    by:['cuentaId'],where:{cuentaId:{in:ids}},_sum:{monto:true}}):[];
   const indexed=new Map(totals.map(x=>[x.cuentaId,x._sum.monto]));
   return {data:rows.map(x=>this.shapeAccount(x,indexed.get(x.id)??null)),meta:{
    page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)},
    nota:'Saldo registrado en movimientos financieros; no equivale a saldo bancario conciliado'};
  });
 }
 async account(u:Principal,id:string){
  return this.atomic(async tx=>{
   const row=await this.accountRow(tx,id);
   await this.permission(tx,u,row.sucursalId!,'finance.read');
   const sum=await tx.movimientoFinanciero.aggregate({where:{cuentaId:id},_sum:{monto:true}});
   return {...this.shapeAccount(row,sum._sum.monto),
    nota:'Saldo registrado sin conciliación bancaria automática'};
  });
 }
 async movements(u:Principal,id:string,q:FinanceMovementQueryDto){
  return this.atomic(async tx=>{
   const row=await this.accountRow(tx,id);
   await this.permission(tx,u,row.sucursalId!,'finance.movements.read');
   const where={cuentaId:id};
   const [rows,total]=await Promise.all([
    tx.movimientoFinanciero.findMany({where,orderBy:[{creadoEn:'desc'},{id:'desc'}],
     skip:(q.page-1)*q.limit,take:q.limit}),
    tx.movimientoFinanciero.count({where})
   ]);
   return {data:rows.map(x=>({id:x.id,cuentaId:x.cuentaId,monto:x.monto.toFixed(2),
    referenciaTipo:x.referenciaTipo,referenciaId:x.referenciaId,
    descripcion:x.descripcion,creadoEn:x.creadoEn})),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async createAccount(u:Principal,d:FinanceAccountCreateDto){
  return this.atomic(async tx=>{
   // Recheck current access even when the idempotency key already exists.
   await this.permission(tx,u,d.sucursalId,'finance.accounts.manage');
   const digest=createHash('sha256').update(JSON.stringify({actor:u.id,op:'FIN_ACCOUNT_CREATE',d})).digest('hex');
   const previous=await tx.operacionIdempotente.findUnique({where:{clave:d.claveOperacion}});
   if(previous){
    if(previous.operacion!=='FIN_ACCOUNT_CREATE'||previous.hashSolicitud!==digest||
     !previous.finalizada||!previous.resultado)
     throw new ConflictException('Clave reutilizada con otros parámetros');
    return previous.resultado as {id:string;nombre:string;tipo:string;moneda:string;activa:boolean};
   }
   const branch=await this.activeBranch(tx,d.sucursalId);
   const name=d.nombre.trim();
   if(name.length<2)throw new ConflictException('Nombre de cuenta financiera inválido');
   if(await tx.cuentaFinanciera.findFirst({where:{sucursalId:d.sucursalId,nombre:name}}))
    throw new ConflictException('Cuenta financiera ya registrada en esta sucursal');
   const row=await tx.cuentaFinanciera.create({data:{
    sucursalId:d.sucursalId,nombre:name,tipo:d.tipo,
    moneda:branch.configuracionSucursalesComoSucursal?.moneda??'GTQ'
   }});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:d.sucursalId,
    accion:'FIN_ACCOUNT_CREATED',entidad:'CuentaFinanciera',entidadId:row.id,
    despues:{tipo:row.tipo,moneda:row.moneda}}});
   await tx.eventoOutbox.create({data:{tipo:'FIN_ACCOUNT_CREATED',agregado:'CuentaFinanciera',
    agregadoId:row.id,payload:{sucursalId:d.sucursalId,tipo:row.tipo}}});
   const result={id:row.id,sucursalId:row.sucursalId,nombre:row.nombre,
    tipo:row.tipo,moneda:row.moneda,activa:row.activa,saldoRegistrado:'0.00'};
   await tx.operacionIdempotente.create({data:{clave:d.claveOperacion,
    operacion:'FIN_ACCOUNT_CREATE',hashSolicitud:digest,resultado:result,
    finalizada:true,expiraEn:new Date(Date.now()+365*86400000)}});
   return result;
  });
 }
}
