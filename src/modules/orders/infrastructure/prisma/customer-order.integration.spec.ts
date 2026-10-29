import {describe,expect,it,vi} from 'vitest';
import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {OrderStore} from './order.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import type {TableStore} from './table.store.js';
import type {KitchenStore} from './kitchen.store.js';
import type {PaymentsStore} from '../../../payments/infrastructure/prisma/payments.store.js';
import type {CustomerSelectionPort} from '../../../customers/application/ports/customers.port.js';

const principal:Principal={id:'employee',email:'test@example.com',nombre:'Operator',
 sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};

function rig(){
 const tx={
  operacionIdempotente:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({})},
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'branch-a',activa:true})},
  orden:{create:vi.fn().mockResolvedValue({id:'order-1'}),
   findUnique:vi.fn().mockResolvedValue({id:'order-1',sucursalId:'branch-a',estado:'ABIERTA',version:3}),
   updateMany:vi.fn().mockResolvedValue({count:1})},
  cuenta:{create:vi.fn().mockResolvedValue({id:'account-1'})},
  configuracionSucursal:{findUnique:vi.fn().mockResolvedValue(null)},
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  eventoOrden:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})}
 };
 const engine={tx:vi.fn(async(run:(tx:any)=>Promise<any>)=>run(tx)),
  allowed:vi.fn().mockResolvedValue(undefined)};
 const customer={assertSelectableInTx:vi.fn().mockResolvedValue(undefined)};
 const store=new OrderStore(
  {} as PrismaService,engine as unknown as InventoryPostingEngine,
  {} as IdentityRepository,{} as TableStore,
  {} as KitchenStore,{} as PaymentsStore,
  customer as unknown as CustomerSelectionPort
 );
 const quote=vi.spyOn(store as any,'quote').mockResolvedValue({varianteId:'v1',
  nombre:'Product',cantidad:1,total:1,unit:1,discount:0,recetaVersionId:null,
  modifiers:[],composition:[],notas:null});
 const insert=vi.spyOn(store as any,'insertLine').mockResolvedValue({id:'l1'});
 const recalc=vi.spyOn(store as any,'recalc').mockResolvedValue({});
 const detail=vi.spyOn(store,'detail').mockResolvedValue({id:'order-1'} as never);
 return {tx,engine,customer,store,quote,insert,recalc,detail};
}
const create=(customerId:string|undefined,operation='ORD:CUST:CREATE:1')=>({
 sucursalId:'branch-a',modalidad:'MOSTRADOR' as const,claveOperacion:operation,
 enviarCocina:false,lineas:[{varianteId:'v1',cantidad:'1.000'}],
 ...(customerId?{clienteId:customerId}:{})
});

describe('ORD-A ↔ DEL-A D1 integration (transaction boundary)',()=>{
 it('creates an order only after selecting active, scoped customer in the SAME tx',async()=>{
  const h=rig();
  await expect(h.store.create(principal,create('customer-a'))).resolves.toEqual({id:'order-1'});
  expect(h.customer.assertSelectableInTx)
   .toHaveBeenCalledExactlyOnceWith(h.tx,principal.id,'branch-a','customer-a');
  expect(h.tx.orden.create).toHaveBeenCalledWith({data:expect.objectContaining({
   clienteId:'customer-a',sucursalId:'branch-a'
  })});
  expect(h.tx.operacionIdempotente.create).toHaveBeenCalledOnce();
  expect(h.engine.tx).toHaveBeenCalledOnce();
  const customerCall=h.customer.assertSelectableInTx.mock.invocationCallOrder[0];
  const orderCall=h.tx.orden.create.mock.invocationCallOrder[0];
  expect(customerCall).toBeLessThan(orderCall);
 });
 it.each([
  ['inactive',new ConflictException('Cliente inactivo')],
  ['foreign branch',new NotFoundException('Cliente no disponible en esta sucursal')],
  ['missing read permission',new ForbiddenException('Permiso insuficiente en la sucursal')]
 ])('rejects %s before writing any order, audit, event or idempotency',async(_why,err)=>{
  const h=rig();h.customer.assertSelectableInTx.mockRejectedValue(err);
  await expect(h.store.create(principal,create('foreign-customer'))).rejects.toThrow(err);
  expect(h.tx.orden.create).not.toHaveBeenCalled();
  expect(h.tx.cuenta.create).not.toHaveBeenCalled();
  expect(h.tx.eventoAuditoria.create).not.toHaveBeenCalled();
  expect(h.tx.eventoOutbox.create).not.toHaveBeenCalled();
  expect(h.tx.operacionIdempotente.create).not.toHaveBeenCalled();
 });
 it('does not require customers.read for anonymous orders without clienteId',async()=>{
  const h=rig();
  await h.store.create(principal,create(undefined,'ORD:CUST:ANONYMOUS:1'));
  expect(h.customer.assertSelectableInTx).not.toHaveBeenCalled();
  expect(h.tx.orden.create).toHaveBeenCalledOnce();
 });
 it('uses persisted order branch in edit, never caller-selected branch',async()=>{
  const h=rig();
  await h.store.edit(principal,'order-1',{version:3,clienteId:'customer-b'});
  expect(h.customer.assertSelectableInTx)
   .toHaveBeenCalledExactlyOnceWith(h.tx,principal.id,'branch-a','customer-b');
  expect(h.tx.orden.updateMany).toHaveBeenCalledWith({where:{
   id:'order-1',version:3,estado:'ABIERTA'
  },data:expect.objectContaining({clienteId:'customer-b'})});
  expect(h.tx.orden.updateMany.mock.invocationCallOrder[0])
   .toBeGreaterThan(h.customer.assertSelectableInTx.mock.invocationCallOrder[0]);
 });
 it('rejects inactive/foreign customer on edit without updating version or auditing',async()=>{
  const h=rig();
  h.customer.assertSelectableInTx.mockRejectedValue(new NotFoundException('Cliente no disponible'));
  await expect(h.store.edit(principal,'order-1',{version:3,clienteId:'foreign-customer'}))
   .rejects.toThrow('Cliente no disponible');
  expect(h.tx.orden.updateMany).not.toHaveBeenCalled();
  expect(h.tx.eventoAuditoria.create).not.toHaveBeenCalled();
 });
 it('does not check customer again if editing only observations',async()=>{
  const h=rig();
  await h.store.edit(principal,'order-1',{version:3,observaciones:'Sin cambios al cliente'});
  expect(h.customer.assertSelectableInTx).not.toHaveBeenCalled();
  expect(h.tx.orden.updateMany).toHaveBeenCalledOnce();
 });
});
