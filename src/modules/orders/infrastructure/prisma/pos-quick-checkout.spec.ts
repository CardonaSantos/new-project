import {describe,it,expect,vi} from 'vitest';
import {ForbiddenException} from '@nestjs/common';
import {OrderStore} from './order.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import type {TableStore} from './table.store.js';
import type {KitchenStore} from './kitchen.store.js';
import type {PaymentsStore} from '../../../payments/infrastructure/prisma/payments.store.js';
import type {CustomerSelectionPort} from '../../../customers/application/ports/customers.port.js';
import type {QuickCheckoutDto} from '../../presentation/http/dto/orders.dto.js';
const actor:Principal={id:'cashier',email:'cash@test.dev',nombre:'Cashier',
 sessionId:'session-1',versionAutorizacion:1,debeCambiarContrasena:false};
function dto():QuickCheckoutDto{return {
 sucursalId:'b1',modalidad:'MOSTRADOR',lineas:[{varianteId:'water',cantidad:'1'}],
 turnoId:'shift-1',pagos:[{metodo:'EFECTIVO',monto:'7.00',efectivoRecibido:'10.00'}],
 claveOperacion:'POS:WATER:001',enviarCocina:true
};}
function rig(type:'INVENTARIABLE'|'PREPARADO'='INVENTARIABLE'){
 const cache=new Map<string,Record<string,unknown>>();
 const tx={
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'b1',activa:true})},
  operacionIdempotente:{
   findUnique:vi.fn(async({where}:{where:{clave:string}})=>cache.get(where.clave)??null),
   create:vi.fn(async({data}:{data:Record<string,unknown>})=>{
    cache.set(data.clave as string,data);return data;
   })
  },
  varianteProducto:{findMany:vi.fn().mockResolvedValue([{id:'water',producto:{tipo:type}}])},
  cuenta:{findFirstOrThrow:vi.fn().mockResolvedValue({id:'account-1'}),
   findMany:vi.fn().mockResolvedValue([{id:'account-1',estado:'ABIERTA'}])},
  intentoPago:{count:vi.fn().mockResolvedValue(0)},
  comanda:{count:vi.fn().mockResolvedValue(1)},
  orden:{findUnique:vi.fn().mockResolvedValue({id:'order-1',sucursalId:'b1',usuarioId:'cashier',estado:'ABIERTA'}),
   findUniqueOrThrow:vi.fn()
   .mockResolvedValueOnce({id:'order-1',estado:'ABIERTA'})
   .mockResolvedValueOnce({id:'order-1',numero:'ORD-1',estado:'CERRADA'})},
  venta:{findUnique:vi.fn().mockResolvedValue({id:'sale-1',total:{toFixed:()=> '7.00'}})}
 };
 const engine={tx:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx)),
  allowed:vi.fn().mockResolvedValue(undefined)};
 const payment={collectInTx:vi.fn().mockResolvedValue({pagoIds:['payment-1']}),
  settleAfterProcessingTx:vi.fn().mockResolvedValue({closed:true})};
 const kitchen={sendTx:vi.fn().mockResolvedValue([])};
 const customer={assertVisibleInTx:vi.fn(),assertSelectableInTx:vi.fn()};
 const store=new OrderStore({} as PrismaService,engine as unknown as InventoryPostingEngine,
  {} as IdentityRepository,{} as TableStore,kitchen as unknown as KitchenStore,
  payment as unknown as PaymentsStore,customer as unknown as CustomerSelectionPort);
 const create=vi.spyOn(store as any,'createCoreTx').mockResolvedValue({orderId:'order-1'});
 return {tx,engine,payment,kitchen,store,create,customer};
}
describe('POS express checkout',()=>{
 it('creates, collects, processes stock after payment when needed, and closes atomically',async()=>{
  const h=rig(),request=dto();
  const result=await h.store.quickCheckout(actor,request);
  expect(result).toEqual({ordenId:'order-1',numero:'ORD-1',ventaId:'sale-1',
   estado:'CERRADA',total:'7.00',pagoIds:['payment-1']});
  expect(h.engine.tx).toHaveBeenCalledOnce();
  expect(h.engine.allowed).toHaveBeenCalledWith(h.tx,'cashier','orders.create','b1');
  expect(h.engine.allowed).toHaveBeenCalledWith(h.tx,'cashier','payments.collect','b1');
  expect(h.create).toHaveBeenCalledOnce();
  expect(h.payment.collectInTx).toHaveBeenCalledOnce();
  expect(h.kitchen.sendTx).toHaveBeenCalledOnce();
  expect(h.payment.settleAfterProcessingTx).toHaveBeenCalledOnce();
  expect(h.tx.operacionIdempotente.create).toHaveBeenCalledOnce();
  expect(h.payment.collectInTx.mock.invocationCallOrder[0])
   .toBeLessThan(h.kitchen.sendTx.mock.invocationCallOrder[0]);
 });
 it('rejects prepared goods before any order, payment or stock write',async()=>{
  const h=rig('PREPARADO');
  await expect(h.store.quickCheckout(actor,dto())).rejects.toThrow('preparados');
  expect(h.create).not.toHaveBeenCalled();
  expect(h.payment.collectInTx).not.toHaveBeenCalled();
 });
 it('rejects unconfirmed transfer in express flow',async()=>{
  const h=rig(),d=dto();d.pagos=[{metodo:'TRANSFERENCIA',monto:'7.00',referencia:'X'}];
  await expect(h.store.quickCheckout(actor,d)).rejects.toThrow('Transferencias');
  expect(h.create).not.toHaveBeenCalled();
 });
 it('a failed payment leaves no successful idempotency record',async()=>{
  const h=rig();h.payment.collectInTx.mockRejectedValue(Error('Cash shift closed'));
  await expect(h.store.quickCheckout(actor,dto())).rejects.toThrow('Cash shift closed');
  expect(h.tx.operacionIdempotente.create).not.toHaveBeenCalled();
  expect(h.kitchen.sendTx).not.toHaveBeenCalled();
 });
 it('cannot replay previously succeeded checkout after permissions are revoked',async()=>{
  const h=rig(),d=dto();
  await h.store.quickCheckout(actor,d);
  h.engine.allowed.mockRejectedValue(new ForbiddenException('Forbidden after role revoked'));
  await expect(h.store.quickCheckout(actor,d)).rejects.toThrow('Forbidden after role revoked');
  expect(h.payment.collectInTx).toHaveBeenCalledOnce();
 });
});

describe('Pay-and-send with one confirmed payment transaction',()=>{
 it('collects and dispatches after payment within one transaction',async()=>{
  const h=rig();
  const result=await h.store.payAndSend(actor,'order-1',{
   turnoId:'shift-1',pagos:[{metodo:'EFECTIVO',monto:'7.00',efectivoRecibido:'10.00'}],
   claveOperacion:'ORDER:PAY:SEND:1'
  });
  expect(result).toEqual({ordenId:'order-1',estado:'CERRADA',
   pagoIds:['payment-1'],comandasPendientes:1});
  expect(h.engine.tx).toHaveBeenCalledOnce();
  expect(h.payment.collectInTx).toHaveBeenCalledOnce();
  expect(h.kitchen.sendTx).toHaveBeenCalledWith(h.tx,actor,'order-1','orders.create');
  expect(h.payment.collectInTx.mock.invocationCallOrder[0])
   .toBeLessThan(h.kitchen.sendTx.mock.invocationCallOrder[0]);
  expect(h.tx.operacionIdempotente.create).toHaveBeenCalledOnce();
 });
 it('does not charge if a transfer awaits verification',async()=>{
  const h=rig();
  await expect(h.store.payAndSend(actor,'order-1',{
   turnoId:'shift-1',pagos:[{metodo:'TRANSFERENCIA',monto:'7.00',referencia:'DEMO'}],
   claveOperacion:'ORDER:PAY:SEND:2'
  })).rejects.toThrow('transferencia');
  expect(h.payment.collectInTx).not.toHaveBeenCalled();
  expect(h.tx.operacionIdempotente.create).not.toHaveBeenCalled();
 });
 it('requires orders.manage for an order created by a different employee',async()=>{
  const h=rig();
  h.tx.orden.findUnique.mockResolvedValue({
   id:'order-1',sucursalId:'b1',usuarioId:'waiter-2',estado:'ABIERTA'
  });
  await h.store.payAndSend(actor,'order-1',{
   turnoId:'shift-1',pagos:[{metodo:'EFECTIVO',monto:'7.00'}],
   claveOperacion:'ORDER:PAY:SEND:3'
  });
  expect(h.engine.allowed).toHaveBeenCalledWith(h.tx,'cashier','orders.manage','b1');
  expect(h.kitchen.sendTx).toHaveBeenCalledWith(h.tx,actor,'order-1','orders.manage');
 });
 it('does not commit idempotency on a financial error',async()=>{
  const h=rig();
  h.payment.collectInTx.mockRejectedValue(Error('Unverified card payment'));
  await expect(h.store.payAndSend(actor,'order-1',{
   turnoId:'shift-1',pagos:[{metodo:'TARJETA',monto:'7.00'}],
   claveOperacion:'ORDER:PAY:SEND:4'
  })).rejects.toThrow('Unverified card payment');
  expect(h.kitchen.sendTx).not.toHaveBeenCalled();
  expect(h.tx.operacionIdempotente.create).not.toHaveBeenCalled();
 });
});
