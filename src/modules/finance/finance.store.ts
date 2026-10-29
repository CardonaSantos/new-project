import {createHash,randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../generated/prisma/client.js';
import {PrismaService} from '../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../auth/application/auth.service.js';
import {CashStore} from '../payments/infrastructure/prisma/cash.store.js';
import {money,operationalDate} from '../payments/domain/payment.policy.js';
import {postVerifiedExternalMovement} from './finance-posting.js';
import type {FinanceAccountCreateDto,FinanceAccountQueryDto,FinanceMovementQueryDto,
 FinanceOperationIntentDto,FinanceExpenseCreateDto,FinanceExpenseQueryDto,
 FinanceExternalPendingQueryDto,FinanceExternalPostDto} from './finance.dto.js';

type Tx=Prisma.TransactionClient;
@Injectable()
export class FinanceStore{
 constructor(private readonly db:PrismaService,private readonly cash:CashStore){}
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

 private digest(value:unknown){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
 }
 private context(u:Principal,sucursalId:string,accion:string){
  return this.digest({usuarioId:u.id,sucursalId,accion});
 }
 private async completeIntent<T extends Record<string,unknown>>(
  tx:Tx,u:Principal,input:{operationId:string;sucursalId:string},accion:string,
  run:()=>Promise<T>
 ):Promise<T>{
  const saved=await tx.operacionIdempotente.findUnique({where:{clave:input.operationId}});
  if(!saved||saved.operacion!==accion||saved.hashSolicitud!==this.context(u,input.sucursalId,accion))
   throw new ConflictException('Operación no emitida para este usuario, acción y sucursal');
  const payloadHash=this.digest({usuarioId:u.id,accion,input});
  if(saved.finalizada){
   const old=saved.resultado as {payloadHash?:string;value?:T}|null;
   if(!old||old.payloadHash!==payloadHash||!old.value)
    throw new ConflictException('Operación reutilizada con parámetros distintos');
   return old.value;
  }
  if(saved.expiraEn.getTime()<Date.now())
   throw new ConflictException('Operación expirada; abra de nuevo el formulario');
  const value=await run();
  await tx.operacionIdempotente.update({where:{clave:input.operationId},data:{
   resultado:{payloadHash,value} as Prisma.InputJsonValue,
   finalizada:true,expiraEn:new Date(Date.now()+365*86400000)
  }});
  return value;
 }
 async issueIntent(u:Principal,d:FinanceOperationIntentDto){
  return this.atomic(async tx=>{
   const code=d.accion==='FIN_ACCOUNT_CREATE'?'finance.accounts.manage':
    d.accion==='FIN_EXPENSE_CREATE'?'finance.expenses.create':'finance.movements.post';
   await this.permission(tx,u,d.sucursalId,code);
   await this.activeBranch(tx,d.sucursalId);
   const operationId='FIN:'+randomUUID();
   const expiresAt=new Date(Date.now()+24*60*60*1000);
   await tx.operacionIdempotente.create({data:{
    clave:operationId,operacion:d.accion,
    hashSolicitud:this.context(u,d.sucursalId,d.accion),
    finalizada:false,expiraEn:expiresAt
   }});
   return {operationId,accion:d.accion,sucursalId:d.sucursalId,expiresAt};
  });
 }
 async createAccount(u:Principal,d:FinanceAccountCreateDto){
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.accounts.manage');
   return this.completeIntent(tx,u,d,'FIN_ACCOUNT_CREATE',async()=>{
    const branch=await this.activeBranch(tx,d.sucursalId);
    const name=d.nombre.trim();
    if(name.length<2)throw new BadRequestException('Nombre de cuenta financiera inválido');
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
    return {id:row.id,sucursalId:row.sucursalId,nombre:row.nombre,
     tipo:row.tipo,moneda:row.moneda,activa:row.activa,saldoRegistrado:'0.00'};
   });
  });
 }
 private async openPeriod(tx:Tx,sucursalId:string,fecha:Date){
  if(await tx.cierreOperativo.findUnique({where:{sucursalId_fechaOperativa:{
   sucursalId,fechaOperativa:fecha}}}))
   throw new ConflictException('Período operativo cerrado; no admite nuevos gastos');
 }
 async createExpense(u:Principal,d:FinanceExpenseCreateDto){
  const monto=money(d.monto);
  if(!d.descripcion.trim()||d.descripcion.trim().length<3)
   throw new BadRequestException('Descripción de gasto requerida');
  if(d.origen==='CAJA'&&(!d.turnoId||d.cuentaFinancieraId))
   throw new BadRequestException('Gasto de caja requiere únicamente turnoId');
  if(d.origen==='CUENTA_FINANCIERA'&&(!d.cuentaFinancieraId||d.turnoId))
   throw new BadRequestException('Gasto bancario requiere únicamente cuentaFinancieraId');
  if(d.origen==='CUENTA_FINANCIERA'&&!d.documentoReferencia?.trim())
   throw new BadRequestException('Referencia de pago externo obligatoria');
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.expenses.create');
   return this.completeIntent(tx,u,d,'FIN_EXPENSE_CREATE',async()=>{
    const branch=await this.activeBranch(tx,d.sucursalId);
    const fechaOperativa=operationalDate(new Date(),branch.zonaHoraria,
     branch.configuracionSucursalesComoSucursal?.horaCorteOperativo??'04:00');
    await this.openPeriod(tx,d.sucursalId,fechaOperativa);
    if(d.proveedorId&&!await tx.proveedor.findFirst({where:{id:d.proveedorId,activo:true}}))
     throw new ConflictException('Proveedor inexistente o inactivo');
    let shiftId:string|null=null;
    let cuentaId:string|null=null;
    if(d.origen==='CAJA'){
     // PAY-A owns cash shift checks. Reuse its public transactional helper
     // within the *same* FIN-A transaction, never call a second HTTP endpoint.
     const shift=await this.cash.shiftTx(tx,u,d.turnoId!,'finance.expenses.create');
     if(shift.caja.sucursalId!==d.sucursalId)throw new ConflictException('Turno de otra sucursal');
     if(shift.fechaOperativa.getTime()!==fechaOperativa.getTime())
      throw new ConflictException('El turno corresponde a otro día operativo');
     const moves=await tx.movimientoCaja.findMany({where:{turnoId:shift.id}});
     const cashAvailable=moves.reduce((sum,m)=>sum.plus(m.tipo==='INGRESO'?m.monto:m.monto.neg()),
      shift.fondoInicial);
     if(monto.gt(cashAvailable))throw new ConflictException('Efectivo insuficiente en caja');
     shiftId=shift.id;
    }else{
     const bank=await this.accountRow(tx,d.cuentaFinancieraId!);
     if(!bank.activa||bank.sucursalId!==d.sucursalId)
      throw new ConflictException('Cuenta financiera inactiva o de otra sucursal');
     if(bank.moneda!==(branch.configuracionSucursalesComoSucursal?.moneda??'GTQ'))
      throw new ConflictException('Moneda de la cuenta no corresponde a la sucursal');
     cuentaId=bank.id;
    }
    const row=await tx.gastoOperativo.create({data:{
     sucursalId:d.sucursalId,usuarioId:u.id,tipo:'OPERATIVO',
     descripcion:d.descripcion.trim(),monto,
     categoria:d.categoria?.trim()??null,
     documentoReferencia:d.documentoReferencia?.trim()??null,
     proveedorId:d.proveedorId??null,
     turnoId:shiftId,cuentaFinancieraId:cuentaId
    }});
    let movimientoId:string;
    if(shiftId){
     const movement=await tx.movimientoCaja.create({data:{
      turnoId:shiftId,tipo:'EGRESO',monto,
      motivo:'Gasto operativo: '+row.descripcion,
      gastoId:row.id,usuarioId:u.id
     }});
     movimientoId=movement.id;
    }else{
     const movement=await tx.movimientoFinanciero.create({data:{
      cuentaId:cuentaId!,monto:monto.neg(),
      referenciaTipo:'GASTO_OPERATIVO',referenciaId:row.id,
      descripcion:row.descripcion
     }});
     movimientoId=movement.id;
    }
    await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:d.sucursalId,
     accion:'FIN_EXPENSE_RECORDED',entidad:'GastoOperativo',entidadId:row.id,
     despues:{monto:monto.toFixed(2),origen:d.origen,movimientoId,
      fechaOperativa:fechaOperativa.toISOString().slice(0,10)}}});
    await tx.eventoOutbox.create({data:{
     tipo:'FIN_EXPENSE_RECORDED',agregado:'GastoOperativo',agregadoId:row.id,
     payload:{sucursalId:d.sucursalId,origen:d.origen,monto:monto.toFixed(2),movimientoId}
    }});
    return {id:row.id,sucursalId:d.sucursalId,monto:monto.toFixed(2),
     origen:d.origen,movimientoId,fechaOperativa:fechaOperativa.toISOString().slice(0,10),
     estado:'REGISTRADO'};
   });
  });
 }

 async pendingExternal(u:Principal,q:FinanceExternalPendingQueryDto){
  return this.atomic(async tx=>{
   await this.permission(tx,u,q.sucursalId,'finance.reconciliation.read');
   const skip=(q.page-1)*q.limit,take=q.limit;
   let sources:{id:string;monto:Prisma.Decimal;metodo:string;referencia:string|null;fecha:Date}[]=[];
   let total=0;
   if(q.sourceType==='PAGO'){
    const where:Prisma.PagoWhereInput={metodo:{not:'EFECTIVO'},
     cuenta:{orden:{sucursalId:q.sucursalId}}};
    const [rows,count]=await Promise.all([
     tx.pago.findMany({where,skip,take,orderBy:[{cobradoEn:'desc'},{id:'desc'}]}),
     tx.pago.count({where})
    ]);
    sources=rows.map(r=>({id:r.id,monto:r.monto,metodo:r.metodo,
     referencia:r.referencia??r.codigoAutorizacion,fecha:r.cobradoEn}));
    total=count;
   }else if(q.sourceType==='PAGO_PROVEEDOR'){
    const where:Prisma.PagoProveedorWhereInput={sucursalId:q.sucursalId,
     estado:'CONFIRMADO',metodo:{not:'EFECTIVO'}};
    const [rows,count]=await Promise.all([
     tx.pagoProveedor.findMany({where,skip,take,orderBy:[{confirmadoEn:'desc'},{id:'desc'}]}),
     tx.pagoProveedor.count({where})
    ]);
    sources=rows.map(r=>({id:r.id,monto:r.monto,metodo:r.metodo,
     referencia:r.referencia,fecha:r.confirmadoEn??r.pagadoEn}));
    total=count;
   }else{
    const where:Prisma.ReembolsoPagoWhereInput={pago:{
     metodo:{not:'EFECTIVO'},cuenta:{orden:{sucursalId:q.sucursalId}}}};
    const [rows,count]=await Promise.all([
     tx.reembolsoPago.findMany({where,skip,take,
      orderBy:[{creadoEn:'desc'},{id:'desc'}],include:{pago:true}}),
     tx.reembolsoPago.count({where})
    ]);
    sources=rows.map(r=>({id:r.id,monto:r.monto,metodo:r.pago.metodo,
     referencia:r.referenciaExterna,fecha:r.creadoEn}));
    total=count;
   }
   const posted=sources.length?await tx.movimientoFinanciero.findMany({where:{
    referenciaTipo:q.sourceType,referenciaId:{in:sources.map(x=>x.id)}
   },select:{referenciaId:true,cuentaId:true,id:true,monto:true}}):[];
   const indexed=new Map(posted.map(x=>[x.referenciaId,x]));
   return {data:sources.map(r=>({
    sourceType:q.sourceType,sourceId:r.id,metodo:r.metodo,
    monto:r.monto.toFixed(2),referencia:r.referencia,fecha:r.fecha,
    estado:indexed.has(r.id)?'REGISTRADO':'PENDIENTE_CUENTA',
    cuentaFinancieraId:indexed.get(r.id)?.cuentaId??null,
    movimientoId:indexed.get(r.id)?.id??null
   })),meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)},
   nota:'Página de operaciones externas confirmadas; PENDIENTE_CUENTA indica falta de imputación, no falta de pago ni conciliación bancaria'};
  });
 }
 async postExternal(u:Principal,d:FinanceExternalPostDto){
  return this.atomic(async tx=>{
   await this.permission(tx,u,d.sucursalId,'finance.movements.post');
   return this.completeIntent(tx,u,d,'FIN_EXTERNAL_POST',async()=>{
    await this.activeBranch(tx,d.sucursalId);
    let value:Prisma.Decimal;
    let description:string;
    if(d.sourceType==='PAGO'){
     const p=await tx.pago.findUnique({where:{id:d.sourceId},
      include:{cuenta:{include:{orden:true}}}});
     if(!p||p.cuenta.orden.sucursalId!==d.sucursalId)
      throw new NotFoundException('Cobro externo inexistente en sucursal');
     if(p.metodo==='EFECTIVO'||p.recibidoPorRepartidor)
      throw new ConflictException('No imputar efectivo o recaudo de repartidor a banco');
     if(p.metodo==='TARJETA'&&!p.codigoAutorizacion?.trim()||
      p.metodo==='TRANSFERENCIA'&&!p.referencia?.trim()||
      p.metodo==='OTRO'&&!p.referencia?.trim())
      throw new ConflictException('Cobro sin evidencia externa confirmada');
     if(p.metodo==='TRANSFERENCIA'){
      const attempt=p.intentoId?await tx.intentoPago.findUnique({where:{id:p.intentoId}}):null;
      if(!attempt||attempt.estado!=='CONFIRMADO')
       throw new ConflictException('Transferencia aún no verificada');
     }
     value=p.monto;description='Cobro externo confirmado';
    }else if(d.sourceType==='PAGO_PROVEEDOR'){
     const p=await tx.pagoProveedor.findUnique({where:{id:d.sourceId}});
     if(!p||p.sucursalId!==d.sucursalId)
      throw new NotFoundException('Pago a proveedor inexistente en sucursal');
     if(p.estado!=='CONFIRMADO'||p.metodo==='EFECTIVO'||!p.referencia?.trim())
      throw new ConflictException('Solo pagos externos confirmados con referencia');
     if(p.cuentaFinancieraId&&p.cuentaFinancieraId!==d.cuentaFinancieraId)
      throw new ConflictException('Pago proveedor ya vinculado a otra cuenta');
     value=p.monto.neg();description='Pago confirmado a proveedor';
    }else{
     const r=await tx.reembolsoPago.findUnique({where:{id:d.sourceId},
      include:{pago:{include:{cuenta:{include:{orden:true}}}}}});
     if(!r||r.pago.cuenta.orden.sucursalId!==d.sucursalId)
      throw new NotFoundException('Reembolso inexistente en sucursal');
     if(r.pago.metodo==='EFECTIVO'||!r.referenciaExterna?.trim())
      throw new ConflictException('Solo reembolso externo con referencia verificada');
     const original=await tx.movimientoFinanciero.findFirst({
      where:{referenciaTipo:'PAGO',referenciaId:r.pagoId}});
     if(!original||original.cuentaId!==d.cuentaFinancieraId)
      throw new ConflictException('Vincule primero el cobro original con la misma cuenta');
     value=r.monto.neg();description='Reembolso externo de cobro';
    }
    const result=await postVerifiedExternalMovement(tx,{
     sucursalId:d.sucursalId,cuentaId:d.cuentaFinancieraId,
     referenciaTipo:d.sourceType,referenciaId:d.sourceId,
     monto:value,descripcion:description
    });
    if(d.sourceType==='PAGO_PROVEEDOR')
     await tx.pagoProveedor.update({where:{id:d.sourceId},
      data:{cuentaFinancieraId:d.cuentaFinancieraId}});
    if(result.created){
     await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:d.sucursalId,
      accion:'FIN_EXTERNAL_POSTED',entidad:'MovimientoFinanciero',entidadId:result.id,
      despues:{sourceType:d.sourceType,sourceId:d.sourceId,monto:result.monto,
       cuentaId:d.cuentaFinancieraId}}});
     await tx.eventoOutbox.create({data:{tipo:'FIN_EXTERNAL_POSTED',
      agregado:'MovimientoFinanciero',agregadoId:result.id,
      payload:{sucursalId:d.sucursalId,sourceType:d.sourceType,sourceId:d.sourceId}}});
    }
    return {sourceType:d.sourceType,sourceId:d.sourceId,
     movimientoId:result.id,cuentaFinancieraId:result.cuentaId,
     monto:result.monto,registrado:true,nuevo:result.created,
     conciliadoBanco:false};
   });
  });
 }

 async expenses(u:Principal,q:FinanceExpenseQueryDto){
  return this.atomic(async tx=>{
   await this.permission(tx,u,q.sucursalId,'finance.expenses.read');
   const where={sucursalId:q.sucursalId};
   const [rows,total]=await Promise.all([
    tx.gastoOperativo.findMany({where,orderBy:[{registradoEn:'desc'},{id:'desc'}],
     skip:(q.page-1)*q.limit,take:q.limit}),
    tx.gastoOperativo.count({where})
   ]);
   return {data:rows.map(x=>({...x,monto:x.monto.toFixed(2)})),
    meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async expense(u:Principal,id:string){
  return this.atomic(async tx=>{
   const row=await tx.gastoOperativo.findUnique({where:{id},
    include:{movimientoCajasComoGasto:true}});
   if(!row)throw new NotFoundException('Gasto operativo inexistente');
   await this.permission(tx,u,row.sucursalId,'finance.expenses.read');
   const movement=row.cuentaFinancieraId?await tx.movimientoFinanciero.findFirst({
    where:{referenciaTipo:'GASTO_OPERATIVO',referenciaId:id}}):null;
   return {...row,monto:row.monto.toFixed(2),movimientoFinanciero:movement?
    {...movement,monto:movement.monto.toFixed(2)}:null};
  });
 }
}
