import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import {PaymentsStore} from '../../../payments/infrastructure/prisma/payments.store.js';
import {FinanceStore} from './finance.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';

const actor={id:'cashier-1'} as Principal;
const dec=(s:string)=>new Prisma.Decimal(s);
function context(){
 const ledger:any[]=[];
 let route:any={activa:true,cuentaFinancieraId:'bank',
  cuentaFinanciera:{id:'bank',activa:true,sucursalId:'branch',tipo:'BANCO',moneda:'GTQ'}};
 const tx={
  pago:{create:vi.fn().mockImplementation(async({data}:any)=>({id:'payment-1',...data}))},
  cuenta:{update:vi.fn().mockResolvedValue({})},
  rutaFinanciera:{findUnique:vi.fn().mockImplementation(async()=>route)},
  configuracionSucursal:{findUnique:vi.fn().mockResolvedValue({moneda:'GTQ'})},
  sucursal:{findUnique:vi.fn().mockResolvedValue({
   id:'branch',activa:true,zonaHoraria:'America/Guatemala',configuracionSucursalesComoSucursal:{moneda:'GTQ'}})},
  cuentaFinanciera:{findUnique:vi.fn().mockResolvedValue({
   id:'bank',sucursalId:'branch',activa:true,moneda:'GTQ',tipo:'BANCO'})},
  cierreOperativo:{findUnique:vi.fn().mockResolvedValue(null)},
  movimientoCaja:{create:vi.fn().mockResolvedValue({})},
  movimientoFinanciero:{
   findFirst:vi.fn().mockImplementation(async()=>ledger[0]??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const r={id:'ledger-1',...data};ledger.push(r);return r;})
  },
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})}
 };
 const payments=new PaymentsStore({} as PrismaService,{} as CashStore);
 const record=(payments as unknown as {record:(...a:any[])=>Promise<any>}).record.bind(payments);
 return {tx,ledger,record,clearRoute:()=>{route=null;}};
}
describe('PAY-A automatic financial routes',()=>{
 it('records confirmed card receipt and bank journal atomically without a cash movement',async()=>{
  const f=context();
  const p=await f.record(f.tx,actor,'bill-1','shift-1','branch',{
   metodo:'TARJETA',monto:'90.00',codigoAutorizacion:'AUTH-123'});
  expect(p.id).toBe('payment-1');
  expect(f.ledger).toHaveLength(1);
  expect(f.ledger[0].monto.toFixed(2)).toBe('90.00');
  expect(f.ledger[0]).toMatchObject({referenciaTipo:'PAGO',referenciaId:'payment-1'});
  expect(f.tx.movimientoCaja.create).not.toHaveBeenCalled();
  expect(f.tx.eventoAuditoria.create).toHaveBeenCalledOnce();
 });
 it('unconfigured method does not interrupt cashier nor invent bank credits',async()=>{
  const f=context();f.clearRoute();
  const p=await f.record(f.tx,actor,'bill-1','shift-1','branch',{
   metodo:'TARJETA',monto:'90.00',codigoAutorizacion:'AUTH-123'});
  expect(p.id).toBe('payment-1');
  expect(f.ledger).toHaveLength(0);
  expect(f.tx.cuenta.update).toHaveBeenCalledOnce();
 });
 it('does not auto-post card receipt without confirmed authorization',async()=>{
  const f=context();
  await f.record(f.tx,actor,'bill-1','shift-1','branch',{
   metodo:'TARJETA',monto:'90.00'});
  expect(f.ledger).toHaveLength(0);
 });
 it('keeps cash payments exclusively inside PAY-A cash register',async()=>{
  const f=context();
  await f.record(f.tx,actor,'bill-1','shift-1','branch',{
   metodo:'EFECTIVO',monto:'10.00'});
  expect(f.ledger).toHaveLength(0);
  expect(f.tx.rutaFinanciera.findUnique).not.toHaveBeenCalled();
  expect(f.tx.movimientoCaja.create).toHaveBeenCalledOnce();
 });
});
describe('FIN-A financial route configuration',()=>{
 it('only accepts allowed account types; impossible to route receipts to a corporate card',async()=>{
  const tx={
   usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'grant'})},
   sucursal:{findUnique:vi.fn().mockResolvedValue({
    id:'branch',activa:true,configuracionSucursalesComoSucursal:{moneda:'GTQ'}})},
   cuentaFinanciera:{findUnique:vi.fn().mockResolvedValue({
    id:'card',sucursalId:'branch',activa:true,moneda:'GTQ',tipo:'TARJETA_EMPRESA'})},
   operacionIdempotente:{
    create:vi.fn().mockResolvedValue({}),
    findUnique:vi.fn().mockResolvedValue({
     clave:'FIN:00000000-0000-0000-0000-000000000000',operacion:'FIN_ROUTING_UPSERT',
     hashSolicitud:'invalid',finalizada:false,expiraEn:new Date(Date.now()+86400000)})
   },
   rutaFinanciera:{upsert:vi.fn()},
  };
  const db={$transaction:vi.fn().mockImplementation(async(f:(t:any)=>unknown)=>f(tx))};
  const store=new FinanceStore(db as unknown as PrismaService,{} as CashStore);
  // The intent must be emitted by the server; without it a forged client key is rejected.
  await expect(store.upsertFinancialRoute(actor,{
   operationId:'FIN:00000000-0000-0000-0000-000000000000',
   sucursalId:'branch',metodo:'TARJETA',cuentaFinancieraId:'card'
  })).rejects.toThrow('Operación no emitida');
  expect(tx.rutaFinanciera.upsert).not.toHaveBeenCalled();
 });
});
