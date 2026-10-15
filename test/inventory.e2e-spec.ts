import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {InventoryService} from '../src/modules/inventory/application/inventory.service.js';
import {InventoryUnitsController,InventoryConversionsController} from '../src/modules/inventory/presentation/http/inventory-units.controller.js';
import {InventoryArticlesController} from '../src/modules/inventory/presentation/http/inventory-articles.controller.js';
import {InventoryWarehousesController,InventoryLocationsController} from '../src/modules/inventory/presentation/http/inventory-storage.controller.js';
import {InventoryReportsController} from '../src/modules/inventory/presentation/http/inventory-reports.controller.js';

const user:Principal={id:'admin',email:'admin@coffee.gt',nombre:'Admin',
 sessionId:'session',versionAutorizacion:1,debeCambiarContrasena:false};
describe('Inventory checkpoint A HTTP contract',()=>{
 let app:INestApplication<App>;
 const service={
  units:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  unitOptions:vi.fn().mockResolvedValue({data:[],meta:{hasMore:false,nextCursor:null}}),
  createUnit:vi.fn().mockResolvedValue({id:'u1',codigo:'G'}),
  articles:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  articleOptions:vi.fn().mockResolvedValue({data:[],meta:{hasMore:false,nextCursor:null}}),
  createArticle:vi.fn().mockResolvedValue({id:'a1',codigo:'CAFE'}),
  warehouses:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createWarehouse:vi.fn().mockResolvedValue({id:'w1',codigo:'BOD-01'}),
  locations:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createLocation:vi.fn().mockResolvedValue({id:'l1',codigo:'REC'}),
  overview:vi.fn().mockResolvedValue({tipo:'MAESTROS_INVENTARIO',existencias:null,valorInventario:null})
 };
 beforeEach(async()=>{
  vi.clearAllMocks();
  const module=await Test.createTestingModule({
   controllers:[InventoryUnitsController,InventoryConversionsController,InventoryArticlesController,
    InventoryWarehousesController,InventoryLocationsController,InventoryReportsController],
   providers:[{provide:InventoryService,useValue:service}]
  }).compile();
  app=module.createNestApplication<App>();
  app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('resuelve la ruta de options antes que :id',async()=>{
  await request(app.getHttpServer()).get('/api/inventory/articles/options?limit=10').expect(200);
  expect(service.articleOptions).toHaveBeenCalledWith(user,expect.objectContaining({limit:10}));
 });
 it('registra unidades, artículos, almacenes y ubicaciones',async()=>{
  await request(app.getHttpServer()).get('/api/inventory/units').expect(200);
  await request(app.getHttpServer()).get('/api/inventory/articles').expect(200);
  await request(app.getHttpServer()).get('/api/inventory/warehouses').expect(200);
  await request(app.getHttpServer()).get('/api/inventory/locations').expect(200);
 });
 it('valida códigos, tipos y dimensiones',async()=>{
  await request(app.getHttpServer()).post('/api/inventory/units')
   .send({codigo:'G',nombre:'Gramo',dimension:'MASA',esBase:true}).expect(201);
  await request(app.getHttpServer()).post('/api/inventory/units')
   .send({codigo:'1',nombre:'X',dimension:'MASA'}).expect(400);
  await request(app.getHttpServer()).post('/api/inventory/articles')
   .send({codigo:'CAFE',nombre:'Café',tipo:'INGREDIENTE',unidadBaseId:'u1'}).expect(201);
  await request(app.getHttpServer()).post('/api/inventory/articles')
   .send({codigo:'CAFE',nombre:'Café',tipo:'INVALIDO',unidadBaseId:'u1'}).expect(400);
  expect(service.createArticle).toHaveBeenCalledTimes(1);
 });
 it('valida filtros booleanos y límites',async()=>{
  await request(app.getHttpServer()).get('/api/inventory/warehouses?activo=no').expect(400);
  await request(app.getHttpServer()).get('/api/inventory/units/options?limit=501').expect(400);
 });
 it('registra endpoint de reportes sin fingir existencia física',async()=>{
  await request(app.getHttpServer()).get('/api/inventory/reports/masters')
   .expect(200).expect({tipo:'MAESTROS_INVENTARIO',existencias:null,valorInventario:null});
 });
});
