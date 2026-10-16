import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {OrderStore} from '../src/modules/orders/infrastructure/prisma/order.store.js';
import {KitchenStore} from '../src/modules/orders/infrastructure/prisma/kitchen.store.js';
import {TableStore} from '../src/modules/orders/infrastructure/prisma/table.store.js';
import {OrdersController,KitchenController,TablesController}
 from '../src/modules/orders/presentation/http/orders.controller.js';
const principal:Principal={id:'a1',email:'user@example.test',nombre:'Test',
 sessionId:'s',debeCambiarContrasena:false,versionAutorizacion:1};
describe('ORD-A HTTP contract',()=>{
 let app:INestApplication<App>;
 const orders={create:vi.fn().mockResolvedValue({id:'o1'}),list:vi.fn(),
  detail:vi.fn(),edit:vi.fn(),add:vi.fn(),editLine:vi.fn(),cancelLine:vi.fn(),
  send:vi.fn(),cancel:vi.fn(),close:vi.fn()};
 const kitchen={stations:vi.fn(),createStation:vi.fn().mockResolvedValue({id:'s1'}),
  updateStation:vi.fn(),routes:vi.fn(),route:vi.fn().mockResolvedValue({id:'r1'}),
  list:vi.fn(),detail:vi.fn(),start:vi.fn().mockResolvedValue({estado:'PREPARANDO'}),
  ready:vi.fn().mockResolvedValue({estado:'LISTA'}),
  startLine:vi.fn(),readyLine:vi.fn(),deliver:vi.fn()};
 const tables={rooms:vi.fn(),createRoom:vi.fn(),list:vi.fn(),
  createTable:vi.fn(),close:vi.fn()};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[
   OrdersController,KitchenController,TablesController
  ],providers:[{provide:OrderStore,useValue:orders},{provide:KitchenStore,useValue:kitchen},
   {provide:TableStore,useValue:tables}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{
   req.auth=principal;next();
  });
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 const order={sucursalId:'b1',modalidad:'MOSTRADOR',
  claveOperacion:'ORDER:HTTP:001',enviarCocina:true,
  lineas:[{varianteId:'v1',cantidad:'2.000',modificadores:[]}]};
 it('creates an order with a single request and rejects malformed quantities',async()=>{
  await request(app.getHttpServer()).post('/api/orders').send(order)
   .expect(201).expect({id:'o1'});
  expect(orders.create).toHaveBeenCalledWith(principal,expect.objectContaining(order));
  for(const bad of ['0','-1','1.0001'])
   await request(app.getHttpServer()).post('/api/orders')
    .send({...order,lineas:[{varianteId:'v1',cantidad:bad}]}).expect(400);
  await request(app.getHttpServer()).post('/api/orders').send({
   ...order,precioUnitario:'0.01'
  }).expect(400);
 });
 it('supports incremental additions, sends and optional draft',async()=>{
  orders.add.mockResolvedValueOnce({id:'o1'});
  orders.send.mockResolvedValueOnce({id:'o1'});
  await request(app.getHttpServer()).post('/api/orders').send({...order,enviarCocina:false}).expect(201);
  await request(app.getHttpServer()).post('/api/orders/o1/lines').send({
   lineas:order.lineas,enviarCocina:true,claveOperacion:'ORDER:HTTP:ADD'
  }).expect(201);
  await request(app.getHttpServer()).post('/api/orders/o1/send').send({
   claveOperacion:'ORDER:HTTP:SEND'
  }).expect(201);
 });
 it('accepts an explicitly classified cancellation and rejects unknown classification',async()=>{
  orders.cancel.mockResolvedValueOnce({id:'o1',clasificacionCancelacion:'MERMA_OPERATIVA'});
  await request(app.getHttpServer()).post('/api/orders/o1/cancel').send({
   motivo:'Preparación perdida al entregar',clasificacion:'MERMA_OPERATIVA'
  }).expect(201);
  expect(orders.cancel).toHaveBeenCalledWith(principal,expect.objectContaining({
   clasificacion:'MERMA_OPERATIVA'
  }));
  await request(app.getHttpServer()).post('/api/orders/o1/cancel').send({
   motivo:'Motivo detallado',clasificacion:'SIN_CONTROL'
  }).expect(400);
 });
 it('routes the preparation board and validates partial consumption',async()=>{
  await request(app.getHttpServer()).post('/api/kitchen/stations').send({
   sucursalId:'b1',nombre:'Barra',ubicacionConsumoId:'stock'
  }).expect(201);
  await request(app.getHttpServer()).post('/api/kitchen/routes').send({
   estacionId:'s1',varianteId:'v1',prioridad:20
  }).expect(201);
  await request(app.getHttpServer()).post('/api/kitchen/tickets/k1/start')
   .expect(201).expect({estado:'PREPARANDO'});
  await request(app.getHttpServer()).post('/api/kitchen/tickets/k1/ready')
   .expect(201).expect({estado:'LISTA'});
  await request(app.getHttpServer()).post('/api/kitchen/lines/l1/start').send({
   cantidad:'0',claveOperacion:'ORDER:HTTP:LINE'
  }).expect(400);
  await request(app.getHttpServer()).get('/api/kitchen/tickets').expect(400);
 });
});
