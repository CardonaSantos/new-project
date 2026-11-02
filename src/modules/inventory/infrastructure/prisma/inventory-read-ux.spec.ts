
import {describe,it,expect,vi} from 'vitest';
import {ForbiddenException,BadRequestException} from '@nestjs/common';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {InventoryPostingEngine} from './inventory-posting.engine.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryDocumentsStore} from './inventory-documents.store.js';
import {InventoryOperationsStore} from './inventory-operations.store.js';

const actor={id:'u1'} as Principal;
function setup(){
 const db={
  sucursal:{findMany:vi.fn().mockResolvedValue([{id:'b1'},{id:'b2'},{id:'b3'}]),
   findUnique:vi.fn().mockResolvedValue({id:'b1'})},
  conteoInventario:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  transferenciaInventario:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  loteInventario:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  $transaction:vi.fn(async (ops:Promise<unknown>[])=>Promise.all(ops))
 };
 const capabilities=vi.fn(async(_user:string,branch:string|null)=>{
  if(branch==='b1'||branch==='b3')return ['inventory.read'];
  return [];
 });
 const docs=new InventoryDocumentsStore(db as unknown as PrismaService,
  {capabilities} as unknown as IdentityRepository,{} as InventoryPostingEngine);
 return {db,capabilities,docs};
}
describe('Inventory read-only indexes',()=>{
 it('checks branch permission before accessing counts',async()=>{
  const {db,docs}=setup();
  await expect(docs.counts(actor,{sucursalId:'b2',page:1,limit:20})).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.conteoInventario.findMany).not.toHaveBeenCalled();
 });
 it('applies branch, status and warehouse filtering to both count and page query',async()=>{
  const {db,docs}=setup();
  const result=await docs.counts(actor,{sucursalId:'b1',page:2,limit:5,
   almacenId:'w1',estado:'BORRADOR'});
  expect(result.meta).toEqual({page:2,limit:5,total:0,totalPages:0});
  const args=db.conteoInventario.findMany.mock.calls[0][0];
  expect(args).toMatchObject({where:{almacen:{sucursalId:'b1',id:'w1'},estado:'BORRADOR'},
   skip:5,take:5});
  expect(db.conteoInventario.count.mock.calls[0][0].where).toEqual(args.where);
 });
 it('never exposes transfers when the user lacks access to the opposite branch',async()=>{
  const {db,docs}=setup();
  const result=await docs.transfers(actor,{sucursalId:'b1',page:1,limit:10});
  expect(result.meta.total).toBe(0);
  const args=db.transferenciaInventario.findMany.mock.calls[0][0];
  expect(args.where.AND).toContainEqual({almacenOrigen:{sucursalId:{in:['b1','b3']}}});
  expect(args.where.AND).toContainEqual({almacenDestino:{sucursalId:{in:['b1','b3']}}});
  expect(args.where.AND[0]).toEqual({OR:[
   {almacenOrigen:{sucursalId:'b1'}},{almacenDestino:{sucursalId:'b1'}}]});
  expect(db.transferenciaInventario.count.mock.calls[0][0].where).toEqual(args.where);
 });
 it('denies listing transfer documents for an unauthorized target branch',async()=>{
  const {db,docs}=setup();
  await expect(docs.transfers(actor,{sucursalId:'b2',page:1,limit:20}))
    .rejects.toBeInstanceOf(ForbiddenException);
  expect(db.transferenciaInventario.findMany).not.toHaveBeenCalled();
 });
 it('returns minimal count summaries without cost fields',async()=>{
  const {db,docs}=setup();
  db.conteoInventario.findMany.mockResolvedValueOnce([{
   id:'c1',almacen:{id:'w1',nombre:'Central',sucursalId:'b1'},estado:'BORRADOR',
   nota:'Conteo del día',usuario:{id:'u1',nombre:'Ana'},
   _count:{conteoInventarioLineasComoConteo:4},
   creadoEn:new Date('2026-11-02T08:00:00Z'),confirmadoEn:null
  }] as never);
  const list=await docs.counts(actor,{sucursalId:'b1',page:1,limit:20});
  expect(list.data[0]).toMatchObject({id:'c1',numeroLineas:4,responsable:{nombre:'Ana'}});
  expect(JSON.stringify(list.data[0])).not.toMatch(/costoUnitario|costoEnTransito/);
 });
});
describe('Inventory lot picker',()=>{
 it('does not change the original stock-restricted lot list by default',async()=>{
  const {db,capabilities,docs}=setup();
  const inventory=new InventoryOperationsStore(db as unknown as PrismaService,
   {capabilities} as unknown as IdentityRepository,{} as InventoryPostingEngine,docs);
  await inventory.lots(actor,{sucursalId:'b1',page:1,limit:20});
  expect(db.loteInventario.findMany.mock.calls[0][0].where)
   .toHaveProperty('existenciasComoLote');
 });
 it('allows new zero-stock lots only for a chosen article and authorized branch',async()=>{
  const {db,capabilities,docs}=setup();
  const inventory=new InventoryOperationsStore(db as unknown as PrismaService,
   {capabilities} as unknown as IdentityRepository,{} as InventoryPostingEngine,docs);
  await inventory.lots(actor,{sucursalId:'b1',articuloId:'a1',incluirSinExistencias:true,page:1,limit:20});
  expect(db.loteInventario.findMany.mock.calls[0][0].where).toEqual({articuloId:'a1'});
  await expect(inventory.lots(actor,{sucursalId:'b1',incluirSinExistencias:true,page:1,limit:20}))
   .rejects.toBeInstanceOf(BadRequestException);
  await expect(inventory.lots(actor,{sucursalId:'b2',articuloId:'a1',incluirSinExistencias:true,page:1,limit:20}))
   .rejects.toBeInstanceOf(ForbiddenException);
 });
});
