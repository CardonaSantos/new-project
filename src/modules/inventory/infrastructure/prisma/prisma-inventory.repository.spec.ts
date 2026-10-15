import {describe,it,expect,vi} from 'vitest';
import {PrismaInventoryRepository} from './prisma-inventory.repository.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
function setup(){
 const db={
  almacen:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  ubicacionAlmacen:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  $transaction:vi.fn(async(items:Promise<unknown>[])=>Promise.all(items))
 } as unknown as PrismaService;
 return {db,repo:new PrismaInventoryRepository(db)};
}
describe('Inventory read isolation',()=>{
 it('no deja que un filtro de sucursal sustituya al alcance autorizado',async()=>{
  const {db,repo}=setup();
  await repo.listWarehouses({page:1,limit:20,sucursalId:'b2'},{global:false,branchIds:['b1']});
  const where=vi.mocked(db.almacen.findMany).mock.calls[0][0]?.where;
  expect(where).toMatchObject({AND:[{sucursalId:{in:['b1']}},{sucursalId:'b2'}]});
 });
 it('combina cursor, permisos y sucursal también en el selector',async()=>{
  const {db,repo}=setup();
  await repo.warehouseOptions({limit:20,sucursalId:'b2',cursor:'x'},{global:false,branchIds:['b1']});
  const where=vi.mocked(db.almacen.findMany).mock.calls[0][0]?.where;
  expect(where).toMatchObject({AND:[
   {sucursalId:{in:['b1']}},{sucursalId:'b2'},{id:{gt:'x'}}
  ]});
 });
 it('no permite filtrar ubicaciones de otra sucursal',async()=>{
  const {db,repo}=setup();
  await repo.listLocations({page:1,limit:20,sucursalId:'b2'},
   {global:false,branchIds:['b1']});
  const where=vi.mocked(db.ubicacionAlmacen.findMany).mock.calls[0][0]?.where;
  expect(where).toMatchObject({AND:[
   {almacen:{sucursalId:{in:['b1']}}},{almacen:{sucursalId:'b2'}}
  ]});
 });
});
