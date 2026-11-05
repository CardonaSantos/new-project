import {describe,it,expect,vi} from 'vitest';
import {ForbiddenException} from '@nestjs/common';
import {KitchenStore} from './kitchen.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {ConsumptionStore} from './consumption.store.js';

const actor:Principal={id:'barista',email:'kitchen@test.dev',nombre:'Barista',
 sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
function rig(){
 const cache=new Map<string,Record<string,unknown>>();
 const tx={
  operacionIdempotente:{
   findUnique:vi.fn(async({where}:{where:{clave:string}})=>cache.get(where.clave)??null),
   create:vi.fn(async({data}:{data:Record<string,unknown>})=>{
    cache.set(data.clave as string,data);return data;
   })
  },
  comandaLinea:{
   findUnique:vi.fn().mockResolvedValue({id:'line-1',comandaId:'ticket-1',
    listaEn:new Date(),entregadaEn:null,canceladaEn:null,
    comanda:{estado:'LISTA',orden:{sucursalId:'branch-1'}}}),
   updateMany:vi.fn().mockResolvedValue({count:1})
  },
  eventoComanda:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})}
 };
 const engine={tx:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx)),
  allowed:vi.fn().mockResolvedValue(undefined)};
 const store=new KitchenStore({} as PrismaService,
  engine as unknown as InventoryPostingEngine,{} as ConsumptionStore);
 const ticket=vi.spyOn(store as any,'ticket').mockResolvedValue({
  id:'ticket-1',orden:{sucursalId:'branch-1'},
  comandaLineasComoComanda:[
   {id:'line-1',canceladaEn:null,listaEn:null},
   {id:'line-2',canceladaEn:null,listaEn:null},
   {id:'line-cancelled',canceladaEn:new Date(),listaEn:null}
  ]
 });
 const start=vi.spyOn(store as any,'startTx').mockResolvedValue('ticket-1');
 const ready=vi.spyOn(store as any,'readyLineTx').mockResolvedValue('ticket-1');
 const deliver=vi.spyOn(store as any,'deliverLineTx').mockResolvedValue('ticket-1');
 vi.spyOn(store,'detail').mockResolvedValue({id:'ticket-1'} as never);
 return {store,engine,tx,ticket,start,ready,deliver};
}
describe('KDS express handoff: atomicity, permissions, idempotency',()=>{
 it('prepares and delivers all active lines inside one serializable engine transaction',async()=>{
  const h=rig();
  const input={claveOperacion:'KITCHEN:READY:1'};
  await h.store.readyDeliver(actor,'ticket-1',input);
  await h.store.readyDeliver(actor,'ticket-1',input);
  expect(h.engine.tx).toHaveBeenCalledTimes(2);
  expect(h.start).toHaveBeenCalledTimes(1);
  expect(h.ready).toHaveBeenCalledTimes(2);
  expect(h.deliver).toHaveBeenCalledTimes(2);
  expect(h.ready.mock.calls.map(c=>c[2])).toEqual(['line-1','line-2']);
  expect(h.deliver.mock.calls.map(c=>c[2])).toEqual(['line-1','line-2']);
  expect(h.tx.operacionIdempotente.create).toHaveBeenCalledOnce();
 });
 it('checks permission on every retry, including cached operation keys',async()=>{
  const h=rig();
  await h.store.readyDeliver(actor,'ticket-1',{claveOperacion:'KITCHEN:READY:2'});
  h.engine.allowed.mockRejectedValue(new ForbiddenException('Revoked kitchen role'));
  await expect(h.store.readyDeliver(actor,'ticket-1',{claveOperacion:'KITCHEN:READY:2'}))
   .rejects.toThrow('Revoked kitchen role');
  expect(h.start).toHaveBeenCalledTimes(1);
 });
 it('prepares and hands off only the selected line',async()=>{
  const h=rig();
  await h.store.readyDeliverLine(actor,'line-1',{claveOperacion:'KITCHEN:LINE:1'});
  expect(h.ready).toHaveBeenCalledOnce();
  expect(h.deliver).toHaveBeenCalledOnce();
  expect(h.ready.mock.calls[0][2]).toBe('line-1');
 });
 it('does not store successful idempotency when preparation or delivery fails',async()=>{
  const h=rig();h.deliver.mockRejectedValue(Error('Stock transaction failed'));
  await expect(h.store.readyDeliver(actor,'ticket-1',{claveOperacion:'KITCHEN:FAIL:1'}))
   .rejects.toThrow('Stock transaction failed');
  expect(h.tx.operacionIdempotente.create).not.toHaveBeenCalled();
 });
 it('allows handoff of already ready tickets after the paid order closes without new preparation',async()=>{
  const h=rig();
  h.ticket.mockResolvedValue({
   id:'ticket-1',estado:'LISTA',orden:{sucursalId:'branch-1',estado:'CERRADA'},
   comandaLineasComoComanda:[
    {id:'line-1',canceladaEn:null,listaEn:new Date(),entregadaEn:null}
   ]
  });
  await h.store.readyDeliver(actor,'ticket-1',{claveOperacion:'KITCHEN:CLOSED:1'});
  expect(h.start).not.toHaveBeenCalled();
  expect(h.ready).not.toHaveBeenCalled();
  expect(h.deliver).toHaveBeenCalledOnce();
 });
 it('never writes another delivery event if a line was already handed off',async()=>{
  const h=rig();
  h.deliver.mockRestore();
  h.tx.comandaLinea.findUnique.mockResolvedValue({
   id:'line-1',comandaId:'ticket-1',listaEn:new Date(),entregadaEn:new Date(),
   canceladaEn:null,comanda:{estado:'LISTA',orden:{sucursalId:'branch-1'}}
  });
  await h.store.deliver(actor,'line-1');
  expect(h.tx.comandaLinea.updateMany).not.toHaveBeenCalled();
  expect(h.tx.eventoComanda.create).not.toHaveBeenCalled();
  expect(h.tx.eventoOutbox.create).not.toHaveBeenCalled();
 });
});
