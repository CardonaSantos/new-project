import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {CustomersController} from '../src/modules/customers/presentation/http/customers.controller.js';
import {CustomersService} from '../src/modules/customers/application/customers.service.js';

const actor:Principal={id:'employee',email:'employee@example.test',nombre:'Operador',
 sessionId:'session',debeCambiarContrasena:false,versionAutorizacion:1};
describe('DEL-A D1 HTTP contracts',()=>{
 let app:INestApplication<App>;
 const svc={
  list:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  detail:vi.fn().mockResolvedValue({id:'customer-1'}),
  create:vi.fn().mockResolvedValue({id:'customer-1'}),
  update:vi.fn().mockResolvedValue({id:'customer-1'}),
  deactivate:vi.fn().mockResolvedValue({id:'customer-1',activo:false}),
  addresses:vi.fn().mockResolvedValue({data:[]}),
  addAddress:vi.fn().mockResolvedValue({id:'address-1'}),
  updateAddress:vi.fn().mockResolvedValue({id:'address-1'}),
  setPrimary:vi.fn().mockResolvedValue({id:'address-1'}),
  deactivateAddress:vi.fn().mockResolvedValue({id:'address-1',activa:false})
 };
 const mutation={sucursalId:'branch-1',claveOperacion:'CUS:HTTP:001'};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const module=await Test.createTestingModule({controllers:[CustomersController],
   providers:[{provide:CustomersService,useValue:svc}]}).compile();
  app=module.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=actor;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('requires a branch, validates pagination and hides customer reads from shared caches',async()=>{
  await request(app.getHttpServer()).get('/api/customers').expect(400);
  const response=await request(app.getHttpServer()).get('/api/customers?sucursalId=branch-1&page=1&limit=20').expect(200);
  expect(response.headers['cache-control']).toBe('no-store');
  await request(app.getHttpServer()).get('/api/customers?sucursalId=branch-1&limit=101').expect(400);
  await request(app.getHttpServer()).get('/api/customers/customer-1').expect(400);
  await request(app.getHttpServer()).get('/api/customers/customer-1?sucursalId=branch-1').expect(200);
 });
 it('validates create/update/deactivate and rejects unexpected personal fields',async()=>{
  await request(app.getHttpServer()).post('/api/customers')
   .send({...mutation,nombre:'Ana Pérez',telefono:'55555555'}).expect(201);
  await request(app.getHttpServer()).post('/api/customers')
   .send({...mutation,nombre:'Ana',password:'not-an-allowed-field'}).expect(400);
  await request(app.getHttpServer()).post('/api/customers')
   .send({...mutation,nombre:'Ana',email:'not-email'}).expect(400);
  await request(app.getHttpServer()).patch('/api/customers/customer-1')
   .send({...mutation,nombre:'Ana C.'}).expect(200);
  await request(app.getHttpServer()).post('/api/customers/customer-1/deactivate')
   .send({...mutation,motivo:'Registro duplicado'}).expect(201);
  expect(svc.create).toHaveBeenCalledOnce();
 });
 it('validates precise coordinates and exposes primary/deactivation actions',async()=>{
  await request(app.getHttpServer()).get('/api/customers/customer-1/addresses?sucursalId=branch-1').expect(200);
  await request(app.getHttpServer()).post('/api/customers/customer-1/addresses')
   .send({...mutation,direccion:'Zona 1, Calle 3',latitud:'15.6789123',longitud:'-91.1234567'}).expect(201);
  await request(app.getHttpServer()).post('/api/customers/customer-1/addresses')
   .send({...mutation,direccion:'Zona 1, Calle 3',latitud:'15.123456789'}).expect(400);
  await request(app.getHttpServer()).patch('/api/customers/customer-1/addresses/address-1')
   .send({...mutation,alias:'Casa'}).expect(200);
  await request(app.getHttpServer()).post('/api/customers/customer-1/addresses/address-1/primary')
   .send(mutation).expect(201);
  await request(app.getHttpServer()).post('/api/customers/customer-1/addresses/address-1/deactivate')
   .send(mutation).expect(201);
  expect(svc.addAddress).toHaveBeenCalledOnce();
 });
});
