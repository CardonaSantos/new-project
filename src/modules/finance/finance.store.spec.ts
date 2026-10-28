import {describe,expect,it,vi} from 'vitest';
import {ForbiddenException} from '@nestjs/common';
import {Prisma} from '../../generated/prisma/client.js';
import {FinanceStore} from './finance.store.js';
import {PrismaService} from '../../infrastructure/database/prisma/prisma.service.js';
import {CashStore} from '../payments/infrastructure/prisma/cash.store.js';
import {operationalDate} from '../payments/domain/payment.policy.js';
import type {Principal} from '../auth/application/auth.service.js';
const actor={id:'finance-admin'} as Principal;
const dec=(s:string)=>new Prisma.Decimal(s);
const expense=(operationId:string,origen:'CAJA'|'CUENTA_FINANCIERA')=>({
 operationId,sucursalId:'branch',origen,monto:'75.00',
 descripcion:'Artículos de limpieza',categoria:'Limpieza',
 ...(origen==='CAJA'?{turnoId:'shift-1'}:
  {cuentaFinancieraId:'account-1',documentoReferencia:'BANK-REF-20261028'})
});
function setup(access=true){
 const prior=new Map<string,any>(),accounts:any[]=[],expenses:any[]=[],
  movementsCash:any[]=[],movementsBank:any[]=[],audit:any[]=[];
 const shift={id:'shift-1',caja:{sucursalId:'branch',activa:true},cajeroId:actor.id,
  cerradaEn:null,fechaOperativa:operationalDate(new Date(),'America/Guatemala','04:00'),
  fondoInicial:dec('100.00')};
 const cash={shiftTx:vi.fn().mockResolvedValue(shift)};
 const tx={
  usuarioRol:{findFirst:vi.fn().mockImplementation(async()=>access?{id:'grant'}:null)},
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'branch',activa:true,
   zonaHoraria:'America/Guatemala',
   configuracionSucursalesComoSucursal:{moneda:'GTQ',horaCorteOperativo:'04:00'}})},
  cuentaFinanciera:{
   findFirst:vi.fn().mockImplementation(async({where}:any)=>accounts.find(x=>x.sucursalId===where.sucursalId&&x.nombre===where.nombre)??null),
   findMany:vi.fn().mockImplementation(async()=>accounts),count:vi.fn().mockImplementation(async()=>accounts.length),
   findUnique:vi.fn().mockImplementation(async({where}:any)=>accounts.find(x=>x.id===where.id)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const row={id:'account-'+(accounts.length+1),...data,activa:true};accounts.push(row);return row;})
  },
  movimientoCaja:{
   findMany:vi.fn().mockImplementation(async()=>movementsCash),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const row={id:'cash-move-'+(movementsCash.length+1),...data};
    movementsCash.push(row);return row;})
  },
  movimientoFinanciero:{
   groupBy:vi.fn().mockResolvedValue([]),aggregate:vi.fn().mockResolvedValue({_sum:{monto:dec('0')}}),
   findMany:vi.fn().mockImplementation(async()=>movementsBank),count:vi.fn().mockImplementation(async()=>movementsBank.length),
   findFirst:vi.fn().mockImplementation(async({where}:any)=>movementsBank.find(x=>x.referenciaId===where.referenciaId)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const row={id:'bank-move-'+(movementsBank.length+1),...data};
    movementsBank.push(row);return row;})
  },
  gastoOperativo:{
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const row={id:'expense-'+(expenses.length+1),...data,registradoEn:new Date()};
    expenses.push(row);return row;}),
   findMany:vi.fn().mockImplementation(async()=>expenses),
   count:vi.fn().mockImplementation(async()=>expenses.length),
   findUnique:vi.fn().mockImplementation(async({where}:any)=>expenses.find(x=>x.id===where.id)??null)
  },
  cierreOperativo:{findUnique:vi.fn().mockResolvedValue(null)},
  proveedor:{findFirst:vi.fn().mockResolvedValue({id:'supplier-1',activo:true})},
  operacionIdempotente:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>prior.get(where.clave)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const row={...data};prior.set(data.clave,row);return row;}),
   update:vi.fn().mockImplementation(async({where,data}:any)=>{
    const row=prior.get(where.clave);Object.assign(row,data);return row;})
  },
  eventoAuditoria:{create:vi.fn().mockImplementation(async({data}:any)=>{audit.push(data);return data;})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})}
 };
 const db={$transaction:vi.fn().mockImplementation(async(fn:(tx:any)=>unknown)=>fn(tx))};
 return {store:new FinanceStore(db as unknown as PrismaService,cash as unknown as CashStore),
  db,tx,cash,shift,prior,accounts,expenses,movementsCash,movementsBank,audit};
}
describe('FIN-A: intents emitidos por servidor y cuentas',()=>{
 it('issues an opaque identifier, never accepts a new account without one, and retries idempotently',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_ACCOUNT_CREATE'});
  expect(intent.operationId).toMatch(/^FIN:[0-9a-f-]{36}$/);
  const d={operationId:intent.operationId,sucursalId:'branch',nombre:'Banco principal',tipo:'BANCO' as const};
  const first=await f.store.createAccount(actor,d),again=await f.store.createAccount(actor,d);
  expect(first.id).toBe('account-1');expect(again).toEqual(first);
  expect(f.tx.cuentaFinanciera.create).toHaveBeenCalledTimes(1);
  await expect(f.store.createAccount(actor,{...d,nombre:'Cuenta distinta'}))
   .rejects.toThrow('parámetros distintos');
  f.tx.usuarioRol.findFirst.mockResolvedValueOnce(null);
  await expect(f.store.createAccount(actor,d)).rejects.toBeInstanceOf(ForbiddenException);
  expect(f.accounts).toHaveLength(1);
  expect(f.audit).toHaveLength(1);
 });
 it('denies account list and intent issuance across unauthorized branch',async()=>{
  const f=setup(false);
  await expect(f.store.accounts(actor,{sucursalId:'branch',page:1,limit:20}))
   .rejects.toBeInstanceOf(ForbiddenException);
  await expect(f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'}))
   .rejects.toBeInstanceOf(ForbiddenException);
  expect(f.prior.size).toBe(0);
 });
 it('aggregates signed financial entries but does not claim bank reconciliation',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_ACCOUNT_CREATE'});
  await f.store.createAccount(actor,{operationId:intent.operationId,
   sucursalId:'branch',nombre:'Banco',tipo:'BANCO'});
  f.tx.movimientoFinanciero.groupBy.mockResolvedValueOnce([{
   cuentaId:'account-1',_sum:{monto:dec('-15.50')}
  }]);
  const page=await f.store.accounts(actor,{sucursalId:'branch',page:1,limit:20});
  expect(page.data[0].saldoRegistrado).toBe('-15.50');
  expect(page.nota).toMatch(/no equivale a saldo bancario/);
 });
});
describe('FIN-A: gastos operativos con movimiento único',()=>{
 it('debits cash once in the same transaction, and a retry returns the original result',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'});
  const d=expense(intent.operationId,'CAJA');
  const a=await f.store.createExpense(actor,d),b=await f.store.createExpense(actor,d);
  expect(a).toEqual(b);
  expect(a.monto).toBe('75.00');
  expect(a.origen).toBe('CAJA');
  expect(f.expenses).toHaveLength(1);
  expect(f.movementsCash).toHaveLength(1);
  expect(f.movementsBank).toHaveLength(0);
  expect(f.movementsCash[0]).toMatchObject({tipo:'EGRESO',gastoId:a.id,turnoId:'shift-1'});
  expect(f.movementsCash[0].monto.toFixed(2)).toBe('75.00');
  await expect(f.store.createExpense(actor,{...d,monto:'70.00'}))
   .rejects.toThrow('parámetros distintos');
 });
 it('rejects insufficient cash and a closed operational day without writing partial data',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'});
  await expect(f.store.createExpense(actor,{...expense(intent.operationId,'CAJA'),monto:'110.00'}))
   .rejects.toThrow('Efectivo insuficiente');
  expect(f.expenses).toHaveLength(0);
  expect(f.movementsCash).toHaveLength(0);
  f.tx.cierreOperativo.findUnique.mockResolvedValueOnce({id:'closed'});
  await expect(f.store.createExpense(actor,expense(intent.operationId,'CAJA')))
   .rejects.toThrow('Período operativo cerrado');
  expect(f.expenses).toHaveLength(0);
 });
 it('blocks cross-branch shifts, and does not produce a financial ledger entry',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'});
  f.cash.shiftTx.mockResolvedValueOnce({...f.shift,caja:{sucursalId:'other',activa:true}});
  await expect(f.store.createExpense(actor,expense(intent.operationId,'CAJA')))
   .rejects.toThrow('Turno de otra sucursal');
  expect(f.movementsCash).toHaveLength(0);
  expect(f.movementsBank).toHaveLength(0);
 });
 it('debits external account exactly once without touching cash',async()=>{
  const f=setup(),created=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_ACCOUNT_CREATE'});
  await f.store.createAccount(actor,{operationId:created.operationId,
   sucursalId:'branch',nombre:'Banco de gastos',tipo:'BANCO'});
  const intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'});
  const d=expense(intent.operationId,'CUENTA_FINANCIERA');
  const value=await f.store.createExpense(actor,d);
  await f.store.createExpense(actor,d);
  expect(value.origen).toBe('CUENTA_FINANCIERA');
  expect(f.movementsBank).toHaveLength(1);
  expect(f.movementsBank[0].monto.toFixed(2)).toBe('-75.00');
  expect(f.movementsBank[0]).toMatchObject({
   referenciaTipo:'GASTO_OPERATIVO',referenciaId:value.id,cuentaId:'account-1'});
  expect(f.movementsCash).toHaveLength(0);
  expect(f.expenses).toHaveLength(1);
 });
 it('rejects missing external reference, mixed funding sources, and forged intent',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'});
  await expect(f.store.createExpense(actor,{...expense(intent.operationId,'CUENTA_FINANCIERA'),
   documentoReferencia:undefined})).rejects.toThrow('Referencia');
  await expect(f.store.createExpense(actor,{...expense(intent.operationId,'CAJA'),
   cuentaFinancieraId:'account-1'})).rejects.toThrow('únicamente turnoId');
  await expect(f.store.createExpense(actor,expense('FIN:00000000-0000-0000-0000-000000000000','CAJA')))
   .rejects.toThrow('no emitida');
  expect(f.expenses).toHaveLength(0);
 });
 it('rejects an intent used by another actor even with the same operationId',async()=>{
  const f=setup(),intent=await f.store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'});
  await expect(f.store.createExpense({id:'other-user'} as Principal,expense(intent.operationId,'CAJA')))
   .rejects.toThrow('no emitida');
 });
});
