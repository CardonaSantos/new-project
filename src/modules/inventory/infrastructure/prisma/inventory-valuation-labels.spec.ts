import {describe,it,expect,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {InventoryPostingEngine} from './inventory-posting.engine.js';
import type {InventoryDocumentsStore} from './inventory-documents.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryOperationsStore} from './inventory-operations.store.js';

describe('Inventory valuation labels',()=>{
 it('returns article name/code with each valuation without extra article queries',async()=>{
  const db={
   sucursal:{findUnique:vi.fn().mockResolvedValue({id:'branch-1'})},
   existencia:{findMany:vi.fn().mockResolvedValue([
    {articuloId:'a1',ubicacionId:'loc-1',articulo:{nombre:'Pajillas',codigo:'PURPAJ'},ubicacion:{id:'loc-1'}},
    {articuloId:'a2',ubicacionId:'loc-1',articulo:{nombre:'Leche',codigo:'LECHE'},ubicacion:{id:'loc-1'}}
   ])},
   empresaConfiguracion:{findFirst:vi.fn().mockResolvedValue({metodoValoracion:'FIFO'})},
   capaCostoInventario:{findMany:vi.fn().mockResolvedValue([
    {articuloId:'a1',cantidadRestante:new Prisma.Decimal('10'),costoUnitario:new Prisma.Decimal('2')},
    {articuloId:'a2',cantidadRestante:new Prisma.Decimal('5'),costoUnitario:new Prisma.Decimal('3')}
   ])},
   articuloInventario:{findMany:vi.fn()}
  };
  const identity={capabilities:vi.fn().mockResolvedValue([
   'inventory.reports.read','inventory.costs.read'
  ])};
  const store=new InventoryOperationsStore(db as unknown as PrismaService,
   identity as unknown as IdentityRepository,{} as InventoryPostingEngine,{} as InventoryDocumentsStore);
  const result=await store.valuation({id:'u1'} as Principal,{sucursalId:'branch-1',page:1,limit:20});
  expect(result.articulos).toEqual([
   {articuloId:'a1',codigo:'PURPAJ',nombre:'Pajillas',valor:'20.000000'},
   {articuloId:'a2',codigo:'LECHE',nombre:'Leche',valor:'15.000000'}
  ]);
  expect(db.articuloInventario.findMany).not.toHaveBeenCalled();
  expect(result.valorInventario).toBe('35.000000');
 });
});
