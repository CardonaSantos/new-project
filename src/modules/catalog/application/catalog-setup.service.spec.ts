import {describe,it,expect,vi} from 'vitest';
import {ConflictException,ForbiddenException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
import {CatalogSetupService} from './catalog-setup.service.js';
import type {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import type {CatalogMenuStore} from '../infrastructure/prisma/catalog-menu.store.js';
import type {ProductSetupDto,MenuLayoutDto} from '../presentation/http/dto/catalog.dto.js';

const flan=():ProductSetupDto=>({
 codigo:'FLAN-001',nombre:'Flan de dulce de leche',tipo:'INVENTARIABLE',
 sucursalId:'b1',variantes:[{nombre:'Única',precio:'20.00',
  nuevoArticulo:{codigo:'ART-FLAN-001-1',nombre:'Flan terminado',requiereLote:true}}]
});

function mocks(){
 const permissions=vi.fn().mockResolvedValue({id:'role1'});
 const stockMovement=vi.fn();
 const tx={
  usuarioRol:{findFirst:permissions},
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'b1',activa:true}),
   findMany:vi.fn().mockResolvedValue([{id:'b1',nombre:'Principal',activa:true}])},
  categoria:{findUnique:vi.fn().mockResolvedValue({id:'category',activa:true})},
  unidadMedida:{findFirst:vi.fn().mockResolvedValue({id:'unit',dimension:'UNIDAD',esBase:true}),
   findUnique:vi.fn().mockResolvedValue({id:'unit',dimension:'UNIDAD',esBase:true})},
  articuloInventario:{
   create:vi.fn().mockResolvedValue({id:'article1',codigo:'ART-FLAN-001-1',nombre:'Flan terminado',tipo:'PRODUCTO_TERMINADO'}),
   findUnique:vi.fn().mockResolvedValue({id:'article1',activo:true,tipo:'PRODUCTO_TERMINADO',unidadBaseId:'unit',
    unidadBase:{dimension:'UNIDAD'}})
  },
  producto:{
   create:vi.fn().mockResolvedValue({id:'p1',nombre:'Flan de dulce de leche',tipo:'INVENTARIABLE'}),
   findUniqueOrThrow:vi.fn().mockResolvedValue({id:'p1',nombre:'Flan de dulce de leche',
    varianteProductosComoProducto:[{id:'v1',nombre:'Única'}]})
  },
  varianteProducto:{
   create:vi.fn().mockResolvedValue({id:'v1',nombre:'Única'}),
   findUnique:vi.fn().mockResolvedValue({id:'v1',activo:true,producto:{activo:true,tipo:'PREPARADO'}}),
   findMany:vi.fn().mockResolvedValue([{id:'v1',nombre:'Única',producto:{id:'p1',nombre:'Flan'}}])
  },
  precioVariante:{
   findFirst:vi.fn().mockResolvedValue(null),
   create:vi.fn().mockResolvedValue({id:'pv1',varianteId:'v1',sucursalId:'b1',importe:new Prisma.Decimal('20.00')}),
   update:vi.fn()
  },
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  grupoModificador:{create:vi.fn().mockResolvedValue({id:'g1',nombre:'Toppings',minimo:0,maximo:2})},
  modificador:{create:vi.fn().mockResolvedValue({
   id:'opt1',nombre:'Canela',incrementoPrecio:new Prisma.Decimal('2.00'),
   requiereComposicion:true
  })},
  modificadorComponente:{createMany:vi.fn().mockResolvedValue({count:1})},
  varianteGrupoModificador:{findMany:vi.fn().mockResolvedValue([]),
   create:vi.fn().mockResolvedValue({})},
  conversionUnidad:{findMany:vi.fn().mockResolvedValue([])},
  movimientoInventario:{create:stockMovement},
  menu:{
   findUnique:vi.fn().mockResolvedValue({id:'m1',activo:true,version:1,publicadoEn:new Date()}),
   updateMany:vi.fn().mockResolvedValue({count:1}),
   update:vi.fn().mockResolvedValue({}),
   findUniqueOrThrow:vi.fn().mockResolvedValue({id:'m1',version:2,publicadoEn:new Date()})
  },
  menuSeccion:{deleteMany:vi.fn(),create:vi.fn()},
  menuHorario:{deleteMany:vi.fn(),createMany:vi.fn()},
  menuSucursal:{deleteMany:vi.fn(),createMany:vi.fn()}
 };
 const db={$transaction:vi.fn(async(fn:(t:typeof tx)=>Promise<unknown>)=>fn(tx))};
 const menuStore={readiness:vi.fn().mockResolvedValue({lista:true,advertencias:[]})};
 const service=new CatalogSetupService(db as unknown as PrismaService,menuStore as unknown as CatalogMenuStore);
 return {service,tx,db,menuStore,stockMovement,permissions};
}

describe('CAT R2 atomic operations',()=>{
 it('creates finished article, product, variant and price inside ONE transaction, never fabricates stock',async()=>{
  const {service,tx,db,stockMovement}=mocks();
  const out=await service.createProductSetup('u1',flan());
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(out.preciosConfigurados).toEqual([{varianteId:'v1',nombre:'Única',importe:'20.00',sucursalId:'b1'}]);
  expect(tx.articuloInventario.create).toHaveBeenCalledWith({data:expect.objectContaining({
   tipo:'PRODUCTO_TERMINADO',unidadBaseId:'unit',requiereLote:true})});
  expect(tx.varianteProducto.create).toHaveBeenCalledWith({data:expect.objectContaining({
   articuloInventarioId:'article1',productoId:'p1'})});
  expect(stockMovement).not.toHaveBeenCalled();
 });
 it('rejects inventory article without permission; no item or variant is persisted',async()=>{
  const {service,tx,permissions}=mocks();
  permissions.mockImplementation(async({where}:{where:{OR:unknown[]}})=>{
   const s=JSON.stringify(where.OR);
   return s.includes('inventory.articles.manage')?null:{id:'role1'};
  });
  await expect(service.createProductSetup('u1',flan())).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.articuloInventario.create).not.toHaveBeenCalled();
  expect(tx.varianteProducto.create).not.toHaveBeenCalled();
 });
 it('does not produce a price or a finished article for a service',async()=>{
  const {service,tx}=mocks();
  const input:ProductSetupDto={codigo:'SERV-1',nombre:'Servicio',tipo:'SERVICIO',
   variantes:[{nombre:'Única'}]};
  const result=await service.createProductSetup('u1',input);
  expect(result.preciosConfigurados).toEqual([]);
  expect(tx.articuloInventario.create).not.toHaveBeenCalled();
  expect(tx.precioVariante.create).not.toHaveBeenCalled();
 });
 it('rejects batch pricing duplicates before beginning a transaction',async()=>{
  const {service,db}=mocks();
  const p={entityId:'v1',sucursalId:'b1',importe:'20.00',vigenteDesde:'2026-11-05T12:00:00Z'};
  await expect(service.batchVariantPrices('u1',[p,p])).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('a failed readiness rejects menu commit before publication, preserving the transactional boundary',async()=>{
  const {service,tx,menuStore}=mocks();
  menuStore.readiness.mockResolvedValue({lista:false,advertencias:['SIN_RECETA_PUBLICADA']});
  const layout:MenuLayoutDto={expectedVersion:1,sucursalIds:['b1'],
   secciones:[{nombre:'Postres',orden:0,items:[{varianteId:'v1',orden:0}]}],horarios:[]};
  await expect(service.commitMenu('u1','m1',layout)).rejects.toBeInstanceOf(ConflictException);
  expect(tx.menu.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'m1',version:1}}));
  expect(tx.menu.update).not.toHaveBeenCalled();
 });
 it('rejected optimistic concurrency never touches published date',async()=>{
  const {service,tx}=mocks();
  tx.menu.updateMany.mockResolvedValue({count:0});
  const layout:MenuLayoutDto={expectedVersion:1,sucursalIds:['b1'],
   secciones:[{nombre:'Postres',orden:0,items:[{varianteId:'v1',orden:0}]}],horarios:[]};
  await expect(service.commitMenu('u1','m1',layout)).rejects.toBeInstanceOf(ConflictException);
  expect(tx.menuSeccion.deleteMany).not.toHaveBeenCalled();
  expect(tx.menu.update).not.toHaveBeenCalled();
 });
});


describe('CAT R3 — atomic modifier setups without accidental inventory movement',()=>{
 it('creates a group with options and its physical consumption in one transaction',async()=>{
  const {service,tx,db,stockMovement}=mocks();
  const result=await service.createModifierGroupWithOptions('u1',{
   nombre:'Toppings',minimo:0,maximo:1,varianteId:'v1',
   opciones:[{nombre:'Canela',incrementoPrecio:'2.00',ingredientes:[{
    articuloId:'article1',unidadId:'unit',cantidad:'0.010',efecto:'SUMAR'
   }]}]
  });
  expect(result.opciones).toHaveLength(1);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.grupoModificador.create).toHaveBeenCalledTimes(1);
  expect(tx.modificadorComponente.createMany).toHaveBeenCalledTimes(1);
  expect(tx.varianteGrupoModificador.create).toHaveBeenCalledTimes(1);
  expect(stockMovement).not.toHaveBeenCalled();
 });
 it('blocks incomplete ingredient amounts before writing the option',async()=>{
  const {service,tx}=mocks();
  await expect(service.createModifierGroupWithOptions('u1',{
   nombre:'Toppings',minimo:0,maximo:1,
   opciones:[{nombre:'Canela',incrementoPrecio:'0.00',ingredientes:[{
    articuloId:'article1',unidadId:'unit',cantidad:'0',efecto:'SUMAR'
   }]}]
  })).rejects.toThrow();
  expect(tx.modificador.create).not.toHaveBeenCalled();
 });
 it('rejects removing ingredient via the guided editor',async()=>{
  const {service,tx}=mocks();
  await expect(service.createModifierGroupWithOptions('u1',{
   nombre:'Toppings',minimo:0,maximo:1,
   opciones:[{nombre:'Sin azúcar',incrementoPrecio:'0.00',ingredientes:[{
    articuloId:'article1',unidadId:'unit',cantidad:'1',efecto:'RESTAR' as 'SUMAR'
   }]}]
  })).rejects.toThrow();
  expect(tx.modificador.create).not.toHaveBeenCalled();
 });
 it('enforces unique option names and valid choices before transaction',async()=>{
  const {service,db}=mocks();
  await expect(service.createModifierGroupWithOptions('u1',{
   nombre:'Toppings',minimo:0,maximo:2,opciones:[
    {nombre:'Canela',incrementoPrecio:'0',ingredientes:[]},
    {nombre:' canela ',incrementoPrecio:'1',ingredientes:[]}
   ]
  })).rejects.toBeInstanceOf(ConflictException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
});

describe('R3-C read-only menu draft validation',()=>{
 const layout:MenuLayoutDto={expectedVersion:1,sucursalIds:['b1'],
  secciones:[{nombre:'Postres',orden:0,items:[{varianteId:'v1',orden:0}]}],horarios:[]};
 it('returns contextual product and branch details without writing to the DB',async()=>{
  const {service,tx,menuStore,stockMovement}=mocks();
  const state=await service.previewMenuReadiness('u1','m1',layout);
  expect(state.lista).toBe(true);
  expect(state.comprobadas).toEqual([expect.objectContaining({
   varianteId:'v1',nombre:'Flan · Única',productoId:'p1',
   sucursal:'Principal',lista:true
  })]);
  expect(menuStore.readiness).toHaveBeenCalledTimes(1);
  expect(tx.menu.updateMany).not.toHaveBeenCalled();
  expect(tx.menuSeccion.deleteMany).not.toHaveBeenCalled();
  expect(stockMovement).not.toHaveBeenCalled();
 });
 it('reports exact product and branch when a published recipe is missing',async()=>{
  const {service,menuStore,tx}=mocks();
  menuStore.readiness.mockResolvedValue({lista:false,
   advertencias:['SIN_RECETA_PUBLICADA'],precio:'20.00'});
  const state=await service.previewMenuReadiness('u1','m1',layout);
  expect(state.lista).toBe(false);
  expect(state.problemas).toEqual([expect.objectContaining({
   codigo:'SIN_RECETA_PUBLICADA',productoId:'p1',varianteId:'v1',sucursalId:'b1'
  })]);
  expect(tx.menu.updateMany).not.toHaveBeenCalled();
 });
 it('prevents reviewing stale menu versions without changing publication',async()=>{
  const {service,tx}=mocks();
  await expect(service.previewMenuReadiness('u1','m1',{...layout,expectedVersion:2}))
   .rejects.toBeInstanceOf(ConflictException);
  expect(tx.menu.update).not.toHaveBeenCalled();
 });
});
