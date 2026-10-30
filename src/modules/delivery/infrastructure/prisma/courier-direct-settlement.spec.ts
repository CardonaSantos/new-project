import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {SettlementCommon} from './settlement-common.js';
import type {DeliveryPaymentsPort} from '../../../payments/application/ports/delivery-payments.port.js';
import type {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import {CourierSettlementsStore} from './courier-settlements.store.js';

const u:Principal={id:'manager',nombre:'Manager',email:'manager@example.test',
 sessionId:'test-session',versionAutorizacion:1,debeCambiarContrasena:false};
const row={
 id:'p1',metodo:'EFECTIVO',recibidoPorRepartidor:true,turnoId:null,
 cobradoPorId:'courier-1',monto:new Prisma.Decimal('22.00'),
 liquidacionRepartidorLineasComoPago:null,reembolsoPagosComoPago:[],
 cuenta:{orden:{sucursalId:'s1',entregasComoOrden:{
  id:'delivery-1',estado:'ENTREGADA',canalExternoId:null,repartidorId:'courier-1'
 }}}
};
function rig(overrides:Partial<typeof row>={}){
 const tx={
  pago:{findMany:vi.fn().mockResolvedValue([{...row,...overrides}])},
  liquidacionRepartidor:{create:vi.fn().mockResolvedValue({id:'settlement-1'})},
  movimientoCaja:{create:vi.fn().mockResolvedValue({id:'cash-movement-1'})}
 };
 const cache=new Map<string,Record<string,unknown>>();
 const ctx={
  atomic:vi.fn(async(f:(v:unknown)=>Promise<unknown>)=>f(tx)),
  branch:vi.fn().mockResolvedValue({id:'s1'}),
  require:vi.fn().mockResolvedValue(undefined),
  audit:vi.fn().mockResolvedValue(undefined),
  once:vi.fn(async(_tx:unknown,_u:unknown,_op:string,key:string,_data:unknown,
   work:()=>Promise<Record<string,unknown>>)=>{
   if(cache.has(key))return cache.get(key)!;
   const result=await work();cache.set(key,result);return result;
  })
 };
 const cashStore={shiftTx:vi.fn().mockResolvedValue({caja:{sucursalId:'s1'}})};
 const store=new CourierSettlementsStore(ctx as unknown as SettlementCommon,
  {} as DeliveryPaymentsPort,cashStore as unknown as CashStore);
 vi.spyOn(store,'detail').mockResolvedValue({id:'settlement-1',estado:'CERRADA'} as never);
 const command={sucursalId:'s1',repartidorId:'courier-1',pagoIds:['p1'],
  turnoCajaId:'shift-1',totalEntregado:'22.00',claveOperacion:'D3:UX:DIRECT:001'};
 return {store,tx,ctx,cashStore,command};
}

describe('DEL-A one-step courier handover',()=>{
 it('creates a CLOSED settlement and ONE cash entry atomically, without a second approval',async()=>{
  const {store,tx,ctx,cashStore,command}=rig();
  const response=await store.closeDirect(u,command);
  expect(response).toMatchObject({id:'settlement-1',estado:'CERRADA',
   movimientoCajaId:'cash-movement-1',totalEntregado:'22.00'});
  expect(tx.liquidacionRepartidor.create).toHaveBeenCalledWith({data:expect.objectContaining({
   sucursalId:'s1',repartidorId:'courier-1',estado:'CERRADA',
   turnoCajaId:'shift-1',totalEntregado:new Prisma.Decimal('22.00'),
   liquidacionRepartidorLineasComoLiquidacion:{create:[{
    pagoId:'p1',entregaId:'delivery-1',monto:new Prisma.Decimal('22.00')
   }]}
  })});
  expect(tx.movimientoCaja.create).toHaveBeenCalledExactlyOnceWith({data:expect.objectContaining({
   turnoId:'shift-1',tipo:'INGRESO',liquidacionRepartidorId:'settlement-1'
  })});
  expect(cashStore.shiftTx).toHaveBeenCalledOnce();
  expect(ctx.audit).toHaveBeenCalledOnce();
  expect(ctx.atomic).toHaveBeenCalledOnce();
  expect(response.lineas).toEqual([{pagoId:'p1',entregaId:'delivery-1',monto:'22.00'}]);
 });
 it('replay retains the original cash movement even if the shift closes',async()=>{
  const {store,tx,cashStore,command}=rig();
  const first=await store.closeDirect(u,command);
  cashStore.shiftTx.mockRejectedValue(new Error('shift no longer open'));
  const second=await store.closeDirect(u,command);
  expect(second.movimientoCajaId).toBe(first.movimientoCajaId);
  expect(tx.movimientoCaja.create).toHaveBeenCalledOnce();
  expect(cashStore.shiftTx).toHaveBeenCalledOnce();
 });
 it('does not post cash or close a settlement if counted cash differs',async()=>{
  const {store,tx,command}=rig();
  await expect(store.closeDirect(u,{...command,totalEntregado:'21.00'}))
   .rejects.toThrow('distinto del esperado');
  expect(tx.liquidacionRepartidor.create).not.toHaveBeenCalled();
  expect(tx.movimientoCaja.create).not.toHaveBeenCalled();
 });
 it('rejects a previously settled payment, never creating a second cash deposit',async()=>{
  const {store,tx,command}=rig({liquidacionRepartidorLineasComoPago:{id:'existing'} as never});
  await expect(store.closeDirect(u,command)).rejects.toThrow('Pago no elegible');
  expect(tx.movimientoCaja.create).not.toHaveBeenCalled();
 });
});
