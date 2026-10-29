import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {FinanceStore} from './finance.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';

const dec=(v:string)=>new Prisma.Decimal(v);
const actor={id:'admin-1'} as Principal;
function setup(){
 const operations=new Map<string,any>(),ledger:any[]=[];
 const payment={
  id:'pay-1',metodo:'TARJETA',monto:dec('90.00'),
  referencia:'PAGO-CARD-1',codigoAutorizacion:'AUTH123',
  recibidoPorRepartidor:false,cuenta:{orden:{sucursalId:'branch'}}
 };
 const supplier={
  id:'supplierpay-1',sucursalId:'branch',estado:'CONFIRMADO',metodo:'TRANSFERENCIA',
  monto:dec('50.00'),referencia:'REF-1',cuentaFinancieraId:null as string|null
 };
 const refund={id:'refund-1',pagoId:'pay-1',monto:dec('20.00'),
  referenciaExterna:'REFUND-1',pago:payment};
 const tx={
  sucursal:{findUnique:vi.fn().mockResolvedValue({
   id:'branch',activa:true,zonaHoraria:'America/Guatemala',configuracionSucursalesComoSucursal:{moneda:'GTQ'}})},
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'admin-grant'})},
  cierreOperativo:{findUnique:vi.fn().mockResolvedValue(null)},
  cuentaFinanciera:{findUnique:vi.fn().mockResolvedValue({
   id:'bank',sucursalId:'branch',activa:true,moneda:'GTQ',tipo:'BANCO'})},
  operacionIdempotente:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>operations.get(where.clave)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    operations.set(data.clave,{...data});return data;}),
   update:vi.fn().mockImplementation(async({where,data}:any)=>{
    const row=operations.get(where.clave);Object.assign(row,data);return row;})
  },
  movimientoFinanciero:{
   findFirst:vi.fn().mockImplementation(async({where}:any)=>
    ledger.find(x=>x.referenciaTipo===where.referenciaTipo&&x.referenciaId===where.referenciaId)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const entry={id:'ledger-'+(ledger.length+1),...data};ledger.push(entry);return entry;}),
   findMany:vi.fn().mockImplementation(async()=>ledger.map(x=>({
    id:x.id,referenciaId:x.referenciaId,cuentaId:x.cuentaId,monto:x.monto})))
  },
  pago:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>where.id===payment.id?payment:null),
   findMany:vi.fn().mockResolvedValue([payment]),
   count:vi.fn().mockResolvedValue(1)
  },
  pagoProveedor:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>where.id===supplier.id?supplier:null),
   findMany:vi.fn().mockResolvedValue([supplier]),
   count:vi.fn().mockResolvedValue(1),
   update:vi.fn().mockImplementation(async({data}:any)=>{
    supplier.cuentaFinancieraId=data.cuentaFinancieraId;return supplier;})
  },
  reembolsoPago:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>where.id===refund.id?refund:null),
   findMany:vi.fn().mockResolvedValue([refund]),
   count:vi.fn().mockResolvedValue(1)
  },
  intentoPago:{findUnique:vi.fn().mockResolvedValue({estado:'CONFIRMADO'})},
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})}
 };
 const db={$transaction:vi.fn().mockImplementation(async(run:(t:any)=>unknown)=>run(tx))};
 const store=new FinanceStore(db as unknown as PrismaService,{} as CashStore);
 async function intent(){
  return store.issueIntent(actor,{sucursalId:'branch',accion:'FIN_EXTERNAL_POST'});
 }
 async function post(sourceType:'PAGO'|'PAGO_PROVEEDOR'|'REEMBOLSO_PAGO',sourceId:string){
  const issued=await intent();
  return store.postExternal(actor,{operationId:issued.operationId,sucursalId:'branch',
   sourceType,sourceId,cuentaFinancieraId:'bank'});
 }
 return {store,tx,ledger,operations,payment,supplier,refund,intent,post};
}
describe('FIN-A financial-source integration PAY-A and PUR-A',()=>{
 it('posts an external PAY-A card receipt once without creating cash or duplicate entry',async()=>{
  const f=setup(),issued=await f.intent();
  const req={operationId:issued.operationId,sucursalId:'branch',sourceType:'PAGO' as const,
   sourceId:'pay-1',cuentaFinancieraId:'bank'};
  const first=await f.store.postExternal(actor,req);
  const second=await f.store.postExternal(actor,req);
  expect(first).toEqual(second);
  expect(first.monto).toBe('90.00');expect(first.nuevo).toBe(true);
  expect(f.ledger).toHaveLength(1);
  expect(f.ledger[0].monto.toFixed(2)).toBe('90.00');
  await expect(f.store.postExternal(actor,{...req,sourceId:'refund-1'}))
   .rejects.toThrow('parámetros distintos');
 });
 it('posts confirmed external PUR-A supplier payment with negative sign once',async()=>{
  const f=setup(),a=await f.post('PAGO_PROVEEDOR','supplierpay-1');
  const b=await f.post('PAGO_PROVEEDOR','supplierpay-1');
  expect(a.nuevo).toBe(true);expect(b.nuevo).toBe(false);
  expect(f.ledger).toHaveLength(1);
  expect(f.ledger[0].monto.toFixed(2)).toBe('-50.00');
  expect(f.supplier.cuentaFinancieraId).toBe('bank');
 });
 it('refund must reference original external account and posts only a negative entry',async()=>{
  const f=setup();
  await expect(f.post('REEMBOLSO_PAGO','refund-1'))
   .rejects.toThrow('Vincule primero el cobro original');
  await f.post('PAGO','pay-1');
  const result=await f.post('REEMBOLSO_PAGO','refund-1');
  expect(result.monto).toBe('-20.00');
  expect(f.ledger).toHaveLength(2);
 });
 it('refuses cash and incomplete verification even if user has finance permission',async()=>{
  const f=setup();
  f.payment.metodo='EFECTIVO';
  await expect(f.post('PAGO','pay-1')).rejects.toThrow('No imputar efectivo');
  f.supplier.estado='PENDIENTE';
  await expect(f.post('PAGO_PROVEEDOR','supplierpay-1'))
   .rejects.toThrow('Solo pagos externos confirmados');
  expect(f.ledger).toHaveLength(0);
 });
 it('does not expose financial source list or post to revoked roles',async()=>{
  const f=setup();
  f.tx.usuarioRol.findFirst.mockResolvedValue(null);
  await expect(f.store.pendingExternal(actor,{sucursalId:'branch',page:1,limit:20,
   sourceType:'PAGO'})).rejects.toThrow('Permiso financiero insuficiente');
  await expect(f.intent()).rejects.toThrow('Permiso financiero insuficiente');
 });
 it('returns paginated source records with ledger status and no invented bank confirmation',async()=>{
  const f=setup();
  const before=await f.store.pendingExternal(actor,{sucursalId:'branch',page:1,limit:20,
   sourceType:'PAGO'});
  expect(before.data[0].estado).toBe('PENDIENTE_CUENTA');
  await f.post('PAGO','pay-1');
  const after=await f.store.pendingExternal(actor,{sucursalId:'branch',page:1,limit:20,
   sourceType:'PAGO'});
  expect(after.data[0].estado).toBe('REGISTRADO');
  expect(after.nota).toMatch(/no falta de pago ni conciliación bancaria/);
 });
});
