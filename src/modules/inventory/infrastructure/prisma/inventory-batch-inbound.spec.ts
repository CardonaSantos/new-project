import {describe,it,expect,vi} from 'vitest';
import {ConflictException} from '@nestjs/common';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {InventoryPostingEngine} from './inventory-posting.engine.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {InventoryDocumentsStore} from './inventory-documents.store.js';
import {InventoryOperationsStore} from './inventory-operations.store.js';

const actor={id:'u1'} as Principal;
const lines=[
 {articuloId:'milk',ubicacionId:'loc1',cantidad:'12',costoUnitario:'8.50'},
 {articuloId:'coffee',ubicacionId:'loc1',cantidad:'5',costoUnitario:'48.75'}
];
const body=(key='BATCH-INV-001')=>({claveOperacion:key,motivo:'Recepción rápida',lineas:lines});
function setup(){
 const posted:Array<{articuloId:string;ubicacionId:string;claveOperacion:string}>=[];
 const operations=new Map<string,{operacion:string;hashSolicitud:string;finalizada:boolean;resultado:unknown}>();
 const caps=vi.fn(async()=>['inventory.costs.read']);
 const identity={capabilities:caps};
 const engine={
  location:vi.fn(async (_tx:unknown,id:string)=>({id,almacen:{
   sucursalId:id==='otherBranch'?'b2':'b1'
  }})),
  allowed:vi.fn(async()=>undefined),
  post:vi.fn(async (tx:{pending:typeof posted},v:(typeof posted)[number])=>{
   if(v.articuloId==='invalid')throw new ConflictException('Artículo inválido');
   tx.pending.push({articuloId:v.articuloId,ubicacionId:v.ubicacionId,
    claveOperacion:v.claveOperacion});
   return {movementId:'m'+tx.pending.length,articuloId:v.articuloId,
    ubicacionId:v.ubicacionId,claveOperacion:v.claveOperacion,costoUnitario:'8.500000',
    costoTotal:'8.500000',sucursalId:'b1'};
  }),
  tx:vi.fn(async (fn:(tx:unknown)=>Promise<unknown>)=>{
   const pending:typeof posted=[];
   let draft:{clave:string;data:{operacion:string;hashSolicitud:string;
    finalizada:boolean;resultado:unknown}}|null=null;
   const tx={
    pending,
    operacionIdempotente:{
     findUnique:async ({where}:{where:{clave:string}})=>operations.get(where.clave)??null,
     create:async ({data}:{data:{clave:string;operacion:string;hashSolicitud:string;
      finalizada:boolean;resultado:unknown}})=>{
      draft={clave:data.clave,data};return data;
     }
    }
   };
   const result=await fn(tx);
   posted.push(...pending);
   if(draft){const saved=draft as {clave:string;data:{operacion:string;hashSolicitud:string;
    finalizada:boolean;resultado:unknown}};operations.set(saved.clave,saved.data)}
   return result;
  })
 };
 const store=new InventoryOperationsStore({} as PrismaService,identity as unknown as IdentityRepository,
  engine as unknown as InventoryPostingEngine,{} as InventoryDocumentsStore);
 return {store,engine,posted,operations};
}
describe('Atomic direct multi-line inbound posting',()=>{
 it('posts one transaction with a distinct movement key per line',async()=>{
  const {store,engine,posted}=setup();
  const result=await store.inboundBatch(actor,body());
  expect(result).toMatchObject({numeroLineas:2,sucursalId:'b1'});
  expect(engine.tx).toHaveBeenCalledTimes(1);
  expect(engine.allowed).toHaveBeenCalledWith(expect.anything(),'u1','inventory.costs.manage','b1');
  expect(engine.post).toHaveBeenCalledTimes(2);
  expect(posted).toHaveLength(2);
  expect(posted[0].claveOperacion).not.toBe(posted[1].claveOperacion);
  expect(posted[0].claveOperacion).not.toBe(body().claveOperacion);
 });
 it('returns the original result for a retry without posting again',async()=>{
  const {store,engine,posted}=setup();
  const first=await store.inboundBatch(actor,body());
  const replay=await store.inboundBatch(actor,body());
  expect(replay).toEqual(first);
  expect(posted).toHaveLength(2);
  expect(engine.post).toHaveBeenCalledTimes(2);
 });
 it('rejects same key with different lines and never posts them',async()=>{
  const {store,engine,posted}=setup();
  await store.inboundBatch(actor,body());
  await expect(store.inboundBatch(actor,{...body(),motivo:'Otro motivo'}))
   .rejects.toBeInstanceOf(ConflictException);
  expect(posted).toHaveLength(2);
  expect(engine.post).toHaveBeenCalledTimes(2);
 });
 it('rolls back all lines if a later one fails',async()=>{
  const {store,posted,operations}=setup();
  const invalid={...body(),lineas:[lines[0],{...lines[1],articuloId:'invalid'}]};
  await expect(store.inboundBatch(actor,invalid)).rejects.toBeInstanceOf(ConflictException);
  expect(posted).toHaveLength(0);
  expect(operations.size).toBe(0);
 });
 it('rejects mixed branches before posting anything',async()=>{
  const {store,engine,posted}=setup();
  await expect(store.inboundBatch(actor,{...body(),
   lineas:[lines[0],{...lines[1],ubicacionId:'otherBranch'}]}))
   .rejects.toBeInstanceOf(ConflictException);
  expect(engine.post).not.toHaveBeenCalled();
  expect(posted).toHaveLength(0);
 });
});
