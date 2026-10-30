import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {DeliveryService} from '../src/modules/delivery/application/delivery.service.js';
import {DeliveryController} from '../src/modules/delivery/presentation/http/delivery.controller.js';
const actor:Principal={id:'admin',nombre:'Admin',email:'admin@example.test',
 sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
describe('DEL-A D2 HTTP contracts',()=>{
 let app:INestApplication<App>;
 const svc={list:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  detail:vi.fn().mockResolvedValue({id:'d1'}),events:vi.fn().mockResolvedValue({data:[]}),
  closureReadiness:vi.fn().mockResolvedValue({entregaId:'d1',canFinalize:true,blockers:[]}),
  finalizeOrder:vi.fn().mockResolvedValue({entregaId:'d1',alreadyClosed:true}),
  create:vi.fn().mockResolvedValue({id:'d1',estado:'PENDIENTE',repartidorId:'courier'}),
  destination:vi.fn().mockResolvedValue({id:'d1'}),assign:vi.fn().mockResolvedValue({id:'d1',repartidorId:'courier'}),
  dispatch:vi.fn().mockResolvedValue({id:'d1',estado:'EN_REPARTO'}),
  complete:vi.fn().mockResolvedValue({id:'d1',estado:'ENTREGADA'}),
  cancel:vi.fn().mockResolvedValue({id:'d1',estado:'CANCELADA'})};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[DeliveryController],
   providers:[{provide:DeliveryService,useValue:svc}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=actor;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 const key={claveOperacion:'DEL:HTTP:001'};
 it('offers financial closure readiness and a one-step PAY-A delegation',async()=>{
  await request(app.getHttpServer()).get('/api/deliveries/d1/closure-readiness')
   .expect(200).expect('Cache-Control','no-store');
  expect(svc.closureReadiness).toHaveBeenCalledExactlyOnceWith(actor,'d1');
  await request(app.getHttpServer()).post('/api/deliveries/d1/finalize-order')
   .send({}).expect(201);
  expect(svc.finalizeOrder).toHaveBeenCalledExactlyOnceWith(actor,'d1');
 });
 it('creates a delivery with courier in ONE action',async()=>{
  await request(app.getHttpServer()).post('/api/deliveries').send({
   ...key,ordenId:'o1',direccionTexto:'Zona 1, Calle 3',repartidorId:'courier'
  }).expect(201);
  expect(svc.create).toHaveBeenCalledWith(actor,expect.objectContaining({repartidorId:'courier'}));
  await request(app.getHttpServer()).post('/api/deliveries').send({
   ...key,ordenId:'o1',direccionTexto:'x'
  }).expect(400);
 });
 it('assigns immediately with no approval workflow',async()=>{
  await request(app.getHttpServer()).post('/api/deliveries/d1/assign').send({
   ...key,repartidorId:'courier'
  }).expect(201).expect({id:'d1',repartidorId:'courier'});
  expect(svc.assign).toHaveBeenCalledExactlyOnceWith(actor,'d1',
   {claveOperacion:key.claveOperacion,repartidorId:'courier'});
  await request(app.getHttpServer()).post('/api/deliveries/d1/assign').send({
   ...key,repartidorId:'courier',aprobar:true
  }).expect(400);
 });
 it('exposes route progression and blocks invalid cancellation reasons',async()=>{
  await request(app.getHttpServer()).post('/api/deliveries/d1/dispatch').send(key).expect(201);
  await request(app.getHttpServer()).post('/api/deliveries/d1/complete').send(key).expect(201);
  await request(app.getHttpServer()).post('/api/deliveries/d1/cancel').send({...key,motivo:'No'}).expect(400);
  await request(app.getHttpServer()).post('/api/deliveries/d1/cancel')
   .send({...key,motivo:'Cliente canceló el envío'}).expect(201);
 });
 it('scopes list request, exposes event history, validates the destination',async()=>{
  await request(app.getHttpServer()).get('/api/deliveries').expect(400);
  const list=await request(app.getHttpServer()).get('/api/deliveries?sucursalId=branch1').expect(200);
  expect(list.headers['cache-control']).toBe('no-store');
  await request(app.getHttpServer()).get('/api/deliveries/d1/events').expect(200);
  await request(app.getHttpServer()).patch('/api/deliveries/d1/destination')
   .send({...key,direccionTexto:'Zona 2, Avenida 5'}).expect(200);
 });
});
