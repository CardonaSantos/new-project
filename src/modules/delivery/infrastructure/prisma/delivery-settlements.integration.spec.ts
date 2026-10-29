import {describe,expect,it,vi} from 'vitest';
import {CourierSettlementsStore} from './courier-settlements.store.js';
import {PlatformSettlementsStore} from './platform-settlements.store.js';
import {ConflictException} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {SettlementCommon} from './settlement-common.js';
import type {DeliveryPaymentsPort} from '../../../payments/application/ports/delivery-payments.port.js';
import type {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import type {PlatformLedgerPort} from '../../../finance/application/ports/platform-ledger.port.js';

const u:Principal={id:'manager',nombre:'Manager',email:'m@example.test',
 sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
const money=(v:string)=>({toFixed:()=>v,lte:(n:number)=>Number(v)<=n,eq:(n:number)=>Number(v)===n});
const common=(tx:unknown)=>({
 atomic:vi.fn(async(fn:(v:unknown)=>Promise<unknown>)=>fn(tx)),
 branch:vi.fn().mockResolvedValue({id:'s1',zonaHoraria:'America/Guatemala',
  configuracionSucursalesComoSucursal:{moneda:'GTQ'}}),
 require:vi.fn().mockResolvedValue(undefined),
 has:vi.fn().mockResolvedValue(true),
 audit:vi.fn().mockResolvedValue(undefined),
 once:vi.fn(async(_tx,_u,_code,_key,_payload,fn)=>fn())
});
describe('DEL-A D3 settlements — no double-money accounting',()=>{
 it('recognizes courier cash through PAY-A only; never inserts MovimientoCaja',async()=>{
  const tx={entrega:{findUnique:vi.fn().mockResolvedValue({
   id:'d1',repartidorId:'courier',orden:{sucursalId:'s1'}})}};
  const ctx=common(tx);
  const payments={collectCourierCashInTx:vi.fn().mockResolvedValue({
   pagoId:'p1',cuentaId:'a1',monto:'22.00'})};
  const store=new CourierSettlementsStore(ctx as unknown as SettlementCommon,
   payments as unknown as DeliveryPaymentsPort,{} as CashStore);
  const res=await store.cash(u,'d1',{cuentaId:'a1',monto:'22.00',
   claveOperacion:'D3:CASH:001'});
  expect(res).toEqual({pagoId:'p1',cuentaId:'a1',monto:'22.00'});
  expect(payments.collectCourierCashInTx).toHaveBeenCalledOnce();
  expect(ctx.audit).toHaveBeenCalledOnce();
  expect((tx as any).movimientoCaja).toBeUndefined();
 });
 it('closes exactly once with ONE cash ingress and no new Pago',async()=>{
  const settlement={id:'l1',sucursalId:'s1',estado:'ABIERTA',
   totalEsperado:money('22.00')};
  const tx={
   liquidacionRepartidor:{findUnique:vi.fn().mockResolvedValue(settlement),
    update:vi.fn().mockResolvedValue({})},
   $queryRaw:vi.fn().mockResolvedValue([]),
   movimientoCaja:{create:vi.fn().mockResolvedValue({id:'movement-1'})}
  };
  const ctx=common(tx);
  const shift={shiftTx:vi.fn().mockResolvedValue({caja:{sucursalId:'s1'}})};
  const store=new CourierSettlementsStore(ctx as unknown as SettlementCommon,
   {} as DeliveryPaymentsPort,shift as unknown as CashStore);
  vi.spyOn(store,'detail').mockResolvedValue({id:'l1'} as never);
  const result=await store.close(u,'l1',{turnoCajaId:'shift-1',
   totalEntregado:'22.00',claveOperacion:'D3:CLOSE:001'});
  expect(result.movimientoCajaId).toBe('movement-1');
  expect(tx.movimientoCaja.create).toHaveBeenCalledOnce();
  expect(tx.movimientoCaja.create).toHaveBeenCalledWith({data:expect.objectContaining({
   liquidacionRepartidorId:'l1',tipo:'INGRESO',turnoId:'shift-1'
  })});
  expect(tx.liquidacionRepartidor.update).toHaveBeenCalledOnce();
  expect(ctx.audit).toHaveBeenCalledOnce();
  expect((tx as any).pago).toBeUndefined();
 });
 it('rejects shortage before posting cash or closing settlement',async()=>{
  const tx={liquidacionRepartidor:{findUnique:vi.fn().mockResolvedValue({
   id:'l1',sucursalId:'s1',estado:'ABIERTA',totalEsperado:money('22.00')}),
   update:vi.fn()},$queryRaw:vi.fn(),movimientoCaja:{create:vi.fn()}};
  const ctx=common(tx);
  const shift={shiftTx:vi.fn().mockResolvedValue({caja:{sucursalId:'s1'}})};
  const store=new CourierSettlementsStore(ctx as unknown as SettlementCommon,
   {} as DeliveryPaymentsPort,shift as unknown as CashStore);
  await expect(store.close(u,'l1',{turnoCajaId:'shift-1',totalEntregado:'21.00',
   claveOperacion:'D3:SHORT:001'})).rejects.toThrow('distinto del esperado');
  expect(tx.movimientoCaja.create).not.toHaveBeenCalled();
  expect(tx.liquidacionRepartidor.update).not.toHaveBeenCalled();
 });
 it('reconciles one platform gross payment and one bank NET posting',async()=>{
  const receiptDate=new Date('2026-10-29T18:00:00.000Z');
  const sh={id:'d1',estado:'ENTREGADA',entregadaEn:receiptDate,
   canalExternoId:'channel',orden:{sucursalId:'s1',origen:'PLATAFORMA',
    cuentasComoOrden:[{id:'a1'}]}};
  const tx={
   canalExterno:{findUnique:vi.fn().mockResolvedValue({id:'channel',activo:true})},
   entrega:{findMany:vi.fn().mockResolvedValue([sh])},
   liquidacionCanalExternoLinea:{count:vi.fn().mockResolvedValue(0)},
   cuentaFinanciera:{findUnique:vi.fn().mockResolvedValue({id:'bank',activa:true,
    sucursalId:'s1',moneda:'GTQ'})},
   liquidacionCanalExterno:{create:vi.fn().mockResolvedValue({id:'settlement-1'})}
  };
  const ctx=common(tx);
  const payment={collectPlatformGrossInTx:vi.fn().mockResolvedValue({
   pagoId:'p1',cuentaId:'a1',monto:'22.00'})};
  const ledger={postNetInTx:vi.fn().mockResolvedValue({
   movimientoId:'bank-move',monto:'20.00',cuentaFinancieraId:'bank'})};
  const store=new PlatformSettlementsStore(ctx as unknown as SettlementCommon,
   payment as unknown as DeliveryPaymentsPort,ledger as unknown as PlatformLedgerPort);
  const result=await store.create(u,{sucursalId:'s1',canalId:'channel',
   cuentaFinancieraId:'bank',periodoInicio:'2026-10-29',periodoFin:'2026-10-29',
   referencia:'BANK-DEV-0001',lineas:[{entregaId:'d1',cuentaId:'a1',
    importeBruto:'22.00',comision:'2.00'}],claveOperacion:'D3:PLATFORM:001'});
  expect(result).toMatchObject({totalBruto:'22.00',totalComision:'2.00',
   totalNeto:'20.00',movimientoFinancieroId:'bank-move'});
  expect(payment.collectPlatformGrossInTx).toHaveBeenCalledOnce();
  expect(ledger.postNetInTx).toHaveBeenCalledExactlyOnceWith(tx,u,{
   sucursalId:'s1',cuentaFinancieraId:'bank',liquidacionId:'settlement-1',monto:'20.00'});
  expect(ctx.audit).toHaveBeenCalledOnce();
 });
});
