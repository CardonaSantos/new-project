import {describe,expect,it,vi} from 'vitest';
import {ForbiddenException} from '@nestjs/common';
import {Prisma} from '../../generated/prisma/client.js';
import {FinanceStore} from './finance.store.js';
import {PrismaService} from '../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../auth/application/auth.service.js';
const actor={id:'finance-admin'} as Principal;
const dec=(s:string)=>new Prisma.Decimal(s);
function setup(access=true){
 const prior=new Map<string,any>();const accounts:any[]=[];const audit:any[]=[];
 const tx={
  usuarioRol:{findFirst:vi.fn().mockImplementation(async()=>access?{id:'grant'}:null)},
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'branch',activa:true,
   configuracionSucursalesComoSucursal:{moneda:'GTQ'}})},
  cuentaFinanciera:{
   findFirst:vi.fn().mockImplementation(async({where}:any)=>accounts.find(x=>x.sucursalId===where.sucursalId&&x.nombre===where.nombre)??null),
   findMany:vi.fn().mockImplementation(async()=>accounts),
   count:vi.fn().mockImplementation(async()=>accounts.length),
   findUnique:vi.fn().mockImplementation(async({where}:any)=>accounts.find(x=>x.id===where.id)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const row={id:'account-'+(accounts.length+1),...data,activa:true};accounts.push(row);return row;})
  },
  movimientoFinanciero:{
   groupBy:vi.fn().mockResolvedValue([]),aggregate:vi.fn().mockResolvedValue({_sum:{monto:dec('0')}}),
   findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)
  },
  operacionIdempotente:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>prior.get(where.clave)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{prior.set(data.clave,data);return data;})
  },
  eventoAuditoria:{create:vi.fn().mockImplementation(async({data}:any)=>{audit.push(data);return data;})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})}
 };
 const db={$transaction:vi.fn().mockImplementation(async(fn:(tx:any)=>unknown)=>fn(tx))};
 return {store:new FinanceStore(db as unknown as PrismaService),db,tx,accounts,audit};
}
describe('FIN-A account registration and read-only ledger',()=>{
 it('creates idempotently, audits, and rejects changed payload for the same key',async()=>{
  const f=setup();const d={claveOperacion:'FIN:ACCOUNT:001',sucursalId:'branch',
   nombre:'Banco principal',tipo:'BANCO' as const};
  const a=await f.store.createAccount(actor,d);
  const b=await f.store.createAccount(actor,d);
  expect(a.id).toBe('account-1');expect(b).toEqual(a);
  expect(f.tx.cuentaFinanciera.create).toHaveBeenCalledTimes(1);
  expect(f.audit).toHaveLength(1);
  expect(a.saldoRegistrado).toBe('0.00');
  await expect(f.store.createAccount(actor,{...d,nombre:'Otra cuenta'})).rejects.toThrow('Clave reutilizada');
  expect(f.accounts).toHaveLength(1);
  // Permissions can be revoked after an operation was initially accepted.
  f.tx.usuarioRol.findFirst.mockResolvedValueOnce(null);
  await expect(f.store.createAccount(actor,d)).rejects.toBeInstanceOf(ForbiddenException);
  expect(f.tx.cuentaFinanciera.create).toHaveBeenCalledTimes(1);
 });
 it('denies branch access before reading confidential finance data',async()=>{
  const f=setup(false);
  await expect(f.store.accounts(actor,{sucursalId:'branch',page:1,limit:20}))
   .rejects.toBeInstanceOf(ForbiddenException);
  expect(f.tx.cuentaFinanciera.findMany).not.toHaveBeenCalled();
  await expect(f.store.createAccount(actor,{claveOperacion:'FIN:ACCOUNT:002',
   sucursalId:'branch',nombre:'Banco',tipo:'BANCO'}))
   .rejects.toBeInstanceOf(ForbiddenException);
  expect(f.accounts).toHaveLength(0);
 });
 it('calculates registered balance from signed movements without assuming bank reconciliation',async()=>{
  const f=setup();await f.store.createAccount(actor,{claveOperacion:'FIN:ACCOUNT:003',
   sucursalId:'branch',nombre:'Banco',tipo:'BANCO'});
  f.tx.movimientoFinanciero.groupBy.mockResolvedValueOnce([{
   cuentaId:'account-1',_sum:{monto:dec('-15.50')}
  }]);
  const page=await f.store.accounts(actor,{sucursalId:'branch',page:1,limit:20});
  expect(page.data[0].saldoRegistrado).toBe('-15.50');
  expect(page.nota).toMatch(/no equivale a saldo bancario/);
 });
});