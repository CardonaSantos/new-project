import {describe,it,expect,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {InventoryPostingEngine} from './inventory-posting.engine.js';
import type {InventoryDocumentsStore} from './inventory-documents.store.js';
import {InventoryOperationsStore} from './inventory-operations.store.js';

describe('Inventory reconciliation labels',()=>{
 it('includes meaningful article, location and lot names for discrepancy positions',async()=>{
  const article={codigo:'PAJ',nombre:'Pajillas'};
  const location={codigo:'REC',nombre:'Recepción'};
  const row={articuloId:'a1',ubicacionId:'loc1',loteId:'lot1',
   articulo:article,ubicacion:location,lote:{codigoLote:'LOTE-1'}};
  const db={
   sucursal:{findUnique:vi.fn().mockResolvedValue({id:'b1'})},
   existencia:{findMany:vi.fn().mockResolvedValue([
    {...row,cantidad:new Prisma.Decimal(10)}])},
   movimientoInventario:{findMany:vi.fn().mockResolvedValue([
    {...row,cantidad:new Prisma.Decimal(9)}])},
   capaCostoInventario:{findMany:vi.fn().mockResolvedValue([
    {...row,cantidadRestante:new Prisma.Decimal(8)}])},
  };
  const identity={capabilities:vi.fn().mockResolvedValue(['inventory.reports.read'])};
  const store=new InventoryOperationsStore(db as unknown as PrismaService,
   identity as unknown as IdentityRepository,
   {} as InventoryPostingEngine,{} as InventoryDocumentsStore);
  const result=await store.reconciliation({id:'u1'} as Principal,
   {sucursalId:'b1',page:1,limit:20});
  expect(result.conciliado).toBe(false);
  expect(result.diferenciasKardex).toEqual([{
   posicion:'a1:loc1:lot1',articulo:article,ubicacion:location,lote:{codigoLote:'LOTE-1'},
   cantidad:'10.000000',kardex:'9.000000'}]);
  expect(result.diferenciasCapas).toEqual([{
   articuloUbicacion:'a1:loc1:',articulo:article,ubicacion:location,
   cantidad:'10.000000',capas:'8.000000'}]);
  expect(db.existencia.findMany).toHaveBeenCalledWith(expect.objectContaining({
   include:expect.objectContaining({articulo:expect.any(Object),ubicacion:expect.any(Object)})
  }));
 });
});
