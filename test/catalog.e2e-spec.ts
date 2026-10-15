import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {CatalogService} from '../src/modules/catalog/application/catalog.service.js';
import {CatalogCategoriesController,CatalogProductsController,CatalogVariantsController} from '../src/modules/catalog/presentation/http/catalog-products.controller.js';
import {CatalogGroupsController,CatalogModifiersController,CatalogVariantGroupsController,CatalogPricesController} from '../src/modules/catalog/presentation/http/catalog-pricing.controller.js';
import {CatalogMenusController,CatalogMenuProjectionController} from '../src/modules/catalog/presentation/http/catalog-menus.controller.js';
import {CatalogReportsController} from '../src/modules/catalog/presentation/http/catalog-reports.controller.js';
const user:Principal={id:'u1',email:'admin@coffee.gt',nombre:'Admin',sessionId:'test',
 versionAutorizacion:1,debeCambiarContrasena:false};
describe('CAT-A HTTP contracts',()=>{
 let app:INestApplication<App>;
 const service={
  categories:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  categoryTree:vi.fn().mockResolvedValue({data:[],total:0}),
  createCategory:vi.fn().mockResolvedValue({id:'cat1',nombre:'Bebidas'}),
  products:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createProduct:vi.fn().mockResolvedValue({id:'p1',codigo:'CAP1'}),
  quote:vi.fn().mockResolvedValue({total:'29.00',moneda:'GTQ'}),
  createPrice:vi.fn().mockResolvedValue({id:'price1'}),
  menus:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createMenu:vi.fn().mockResolvedValue({id:'m1'}),
  layout:vi.fn().mockResolvedValue({id:'m1',version:2}),
  publish:vi.fn().mockResolvedValue({id:'m1',publicadoEn:'2026-10-15T18:00:00Z'}),
  branchMenu:vi.fn().mockResolvedValue({menus:[],nota:'Sin datos'}),
  summary:vi.fn().mockResolvedValue({productosActivos:0,ventas:null,rentabilidad:null})
 };
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[
   CatalogCategoriesController,CatalogProductsController,CatalogVariantsController,
   CatalogGroupsController,CatalogModifiersController,CatalogVariantGroupsController,
   CatalogPricesController,CatalogMenusController,CatalogMenuProjectionController,
   CatalogReportsController
  ],providers:[{provide:CatalogService,useValue:service}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('registers category tree before dynamic route',async()=>{
  await request(app.getHttpServer()).get('/api/catalog/categories/tree').expect(200);
  expect(service.categoryTree).toHaveBeenCalledWith(user);
 });
 it('rejects invalid product and accepts variants',async()=>{
  await request(app.getHttpServer()).post('/api/catalog/products').send({
   codigo:'CAP1',nombre:'Capuchino',tipo:'PREPARADO',variantes:[{nombre:'Grande',orden:0}]
  }).expect(201);
  await request(app.getHttpServer()).post('/api/catalog/products').send({
   codigo:'CAP2',nombre:'Capuchino',tipo:'INCORRECTO'
  }).expect(400);
  expect(service.createProduct).toHaveBeenCalledTimes(1);
 });
 it('validates price vigencias',async()=>{
  await request(app.getHttpServer()).post('/api/catalog/prices/variants').send({
   entityId:'v1',sucursalId:'b1',importe:'26.00',vigenteDesde:'2026-10-15T18:00:00Z'
  }).expect(201);
  await request(app.getHttpServer()).post('/api/catalog/prices/variants').send({
   entityId:'v1',sucursalId:'b1',importe:'26.001',vigenteDesde:'2026-10-15T18:00:00Z'
  }).expect(400);
 });
 it('validates quote selection as a string array',async()=>{
  await request(app.getHttpServer()).post('/api/catalog/prices/quote').send({
   varianteId:'v1',sucursalId:'b1',modificadorIds:['m1']
  }).expect(201);
  await request(app.getHttpServer()).post('/api/catalog/prices/quote').send({
   varianteId:'v1',sucursalId:'b1',modificadorIds:['m1','m1']
  }).expect(400);
 });
 it('requires optimistic version and well-formed schedule',async()=>{
  await request(app.getHttpServer()).put('/api/catalog/menus/m1/layout').send({
   expectedVersion:1,sucursalIds:['b1'],secciones:[{nombre:'Bebidas',orden:0,
    items:[{varianteId:'v1',orden:0}]}],
   horarios:[{diaSemana:1,desde:'08:00',hasta:'15:00'}]
  }).expect(200);
  await request(app.getHttpServer()).put('/api/catalog/menus/m1/layout').send({
   expectedVersion:0,sucursalIds:['b1'],secciones:[],horarios:[]
  }).expect(400);
 });
 it('returns commercial reports with missing future-sales metrics',async()=>{
  await request(app.getHttpServer()).get('/api/catalog/reports/summary').expect(200)
   .expect({productosActivos:0,ventas:null,rentabilidad:null});
 });
});
