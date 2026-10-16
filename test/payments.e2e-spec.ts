
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {CashStore} from '../src/modules/payments/infrastructure/prisma/cash.store.js';
import {PaymentsStore} from '../src/modules/payments/infrastructure/prisma/payments.store.js';
import {CashController,AccountsController,AttemptsController,PaymentsController,SalesController}
 from '../src/modules/payments/presentation/http/payments.controller.js';
const principal:Principal={id:'u1',email:'cashier@test.local',nombre:'Caja',
 sessionId:'s',debeCambiarContrasena:false,versionAutorizacion:1};
describe('PAY-A HTTP DTO contract',()=>{
 let app:INestApplication<App>;
 const cash={create:vi.fn().mockResolvedValue({id:'c1'}),registers:vi.fn(),update:vi.fn(),
  list:vi.fn(),open:vi.fn().mockResolvedValue({id:'s1'}),detail:vi.fn(),
  movement:vi.fn(),close:vi.fn()};
 const pay={collect:vi.fn().mockResolvedValue({accountId:'a1'}),account:vi.fn(),
  accounts:vi.fn(),confirm:vi.fn().mockResolvedValue({pagoId:'p1'}),
  refund:vi.fn(),split:vi.fn(),splitEqual:vi.fn(),sales:vi.fn(),finalize:vi.fn()};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[
   CashController,AccountsController,AttemptsController,PaymentsController,SalesController],
   providers:[{provide:CashStore,useValue:cash},{provide:PaymentsStore,useValue:pay}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=principal;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('registers a cash register and rejects an unknown field',async()=>{
  await request(app.getHttpServer()).post('/api/cash/registers').send({
   sucursalId:'branch',codigo:'POS-01',nombre:'Principal'}).expect(201);
  await request(app.getHttpServer()).post('/api/cash/registers').send({
   sucursalId:'branch',codigo:'POS-01',nombre:'Principal',extra:123}).expect(400);
 });
 it('rejects negative money and supports mixed validated payments',async()=>{
  await request(app.getHttpServer()).post('/api/cash/shifts').send({
   cajaId:'c1',fondoInicial:'-100',claveOperacion:'PAY:OPEN:001'}).expect(400);
  await request(app.getHttpServer()).post('/api/accounts/a1/payments').send({
   turnoId:'s1',claveOperacion:'PAY:COLLECT:001',
   pagos:[{metodo:'EFECTIVO',monto:'20.00'},{metodo:'TARJETA',monto:'7.00',codigoAutorizacion:'ok'}]
  }).expect(201);
  expect(pay.collect).toHaveBeenCalledWith(principal,'a1',expect.objectContaining({
   pagos:expect.arrayContaining([expect.objectContaining({monto:'20.00'})])
  }));
  await request(app.getHttpServer()).post('/api/accounts/a1/payments').send({
   turnoId:'s1',claveOperacion:'PAY:COLLECT:002',pagos:[{metodo:'EFECTIVO',monto:'1.001'}]
  }).expect(400);
 });
 it('validates splits, verification and refunds',async()=>{
  await request(app.getHttpServer()).post('/api/accounts/order/o1/split-equal').send({
   personas:3,claveOperacion:'PAY:SPLIT:001'}).expect(201);
  await request(app.getHttpServer()).post('/api/accounts/order/o1/split-equal').send({
   personas:1,claveOperacion:'PAY:SPLIT:002'}).expect(400);
  await request(app.getHttpServer()).post('/api/payment-attempts/i1/confirm').send({
   turnoId:'s1',motivo:'Depósito verificado',claveOperacion:'PAY:CONFIRM:01'}).expect(201);
  await request(app.getHttpServer()).post('/api/payments/p1/refund').send({
   monto:'5.00',motivo:'Servicio cancelado',claveOperacion:'PAY:REFUND:001'}).expect(201);
 });
});
