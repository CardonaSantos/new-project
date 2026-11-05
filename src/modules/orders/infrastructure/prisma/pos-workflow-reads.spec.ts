import {describe,it,expect,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {KitchenStore} from './kitchen.store.js';
import {OrderStore} from './order.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {TableStore} from './table.store.js';
import type {PaymentsStore} from '../../../payments/infrastructure/prisma/payments.store.js';
import type {CustomerSelectionPort} from '../../../customers/application/ports/customers.port.js';
import type {ConsumptionStore} from './consumption.store.js';
const actor:Principal={id:'waiter',email:'waiter@example.test',nombre:'Waiter',
 sessionId:'sess',versionAutorizacion:1,debeCambiarContrasena:false};
const money=(n:string)=>new Prisma.Decimal(n);
describe('Workflow data reads use server-side scope, pagination and counts',()=>{
 it('returns queue counts for the whole branch, not just the visible page',async()=>{
  const tx={
   comanda:{
    findMany:vi.fn().mockResolvedValue([{id:'ticket-5'}]),
    count:vi.fn().mockResolvedValueOnce(27).mockResolvedValueOnce(14)
     .mockResolvedValueOnce(5).mockResolvedValueOnce(6).mockResolvedValueOnce(2)
   },
   estacionPreparacion:{findUnique:vi.fn().mockResolvedValue({id:'station',sucursalId:'b1'})}
  };
  const engine={tx:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx)),
   allowed:vi.fn().mockResolvedValue(undefined)};
  const store=new KitchenStore({} as PrismaService,
   engine as unknown as InventoryPostingEngine,{} as ConsumptionStore);
  const result=await store.queue(actor,{sucursalId:'b1',estacionId:'station',
   vista:'ACTIVAS',page:2,limit:5});
  expect(result.meta).toEqual({page:2,limit:5,total:27,totalPages:6});
  expect(result.totals).toEqual({pending:14,preparing:5,readyToDeliver:6,delivered:2});
  expect(tx.comanda.findMany).toHaveBeenCalledWith(expect.objectContaining({
   orderBy:[{enviadaEn:'asc'},{id:'asc'}],skip:5,take:5
  }));
  expect(engine.allowed).toHaveBeenCalledWith(tx,'waiter','kitchen.read','b1');
 });
 it('does not expose a queue station from another branch',async()=>{
  const tx={estacionPreparacion:{findUnique:vi.fn().mockResolvedValue({
   id:'station-other',sucursalId:'b2'
  })},comanda:{findMany:vi.fn()}};
  const engine={tx:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx)),
   allowed:vi.fn().mockResolvedValue(undefined)};
  const store=new KitchenStore({} as PrismaService,
   engine as unknown as InventoryPostingEngine,{} as ConsumptionStore);
  await expect(store.queue(actor,{sucursalId:'b1',estacionId:'station-other',
   vista:'ACTIVAS',page:1,limit:30})).rejects.toThrow('Estación fuera de sucursal');
  expect(tx.comanda.findMany).not.toHaveBeenCalled();
 });
 it('returns balances and kitchen status with one paginated worklist query',async()=>{
  const tx={orden:{
   findMany:vi.fn().mockResolvedValue([{
    id:'o1',numero:'ORD-1',sucursalId:'b1',estado:'ABIERTA',
    modalidad:'MESA',version:2,abiertaEn:new Date('2026-11-05T09:00:00Z'),
    ocupacionMesaId:'occupancy',ocupacionMesa:{mesa:{id:'table',
     numero:'3',sala:{nombre:'Principal'}}},
    total:money('24'),cuentasComoOrden:[{id:'a1',total:money('24'),
     pagado:money('4'),estado:'ABIERTA'}],
    ordenLineasComoOrden:[{id:'l1',cantidad:money('2'),
     cantidadEnviada:money('1'),canceladaEn:null}],
    comandasComoOrden:[
     {id:'c1',estado:'PREPARANDO',comandaLineasComoComanda:[
      {canceladaEn:null,entregadaEn:null}]},
     {id:'c2',estado:'LISTA',comandaLineasComoComanda:[
      {canceladaEn:null,entregadaEn:null}]}
    ]
   }]),
   count:vi.fn().mockResolvedValue(21)
  }};
  const engine={tx:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx)),
   allowed:vi.fn().mockResolvedValue(undefined)};
  const store=new OrderStore({} as PrismaService,engine as unknown as InventoryPostingEngine,
   {} as IdentityRepository,{} as TableStore,
   {} as KitchenStore,{} as PaymentsStore,{} as CustomerSelectionPort);
  const result=await store.worklist(actor,{sucursalId:'b1',page:1,limit:10});
  expect(result.meta).toEqual({page:1,limit:10,total:21,totalPages:3});
  expect(result.data[0]).toMatchObject({numero:'ORD-1',total:'24.00',
   pagado:'4.00',saldo:'20.00',needsProcessing:true,
   kitchen:{pending:0,preparing:1,toDeliver:1},mesa:{numero:'3'}});
  expect(tx.orden.findMany).toHaveBeenCalledOnce();
  expect(tx.orden.count).toHaveBeenCalledOnce();
  expect(engine.allowed).toHaveBeenCalledWith(tx,'waiter','orders.read','b1');
 });
});
