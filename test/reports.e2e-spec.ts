import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {ReportsController} from '../src/modules/reports/presentation/http/reports.controller.js';
import {ReportingService} from '../src/modules/reports/application/reporting.service.js';
const user:Principal={id:'u1',nombre:'Administrador',email:'a@test.dev',sessionId:'s1',
 versionAutorizacion:1,debeCambiarContrasena:false};
const svc={operational:vi.fn().mockResolvedValue({kpis:{pedidosAbiertos:0}}),
 overview:vi.fn().mockResolvedValue({currency:'GTQ',kpis:{ventasNetas:'0.00'}}),
 tickets:vi.fn().mockResolvedValue({data:[],meta:{total:0}}),
 paymentsByMethod:vi.fn().mockResolvedValue({data:[]}),
 expensesByCategory:vi.fn().mockResolvedValue({data:[]}),
 cashShifts:vi.fn().mockResolvedValue({data:[],meta:{total:0}})};
describe('REP-1 read-only reporting HTTP contract',()=>{
 let app:INestApplication<App>;
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[ReportsController],
   providers:[{provide:ReportingService,useValue:svc}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('requires a branch for a live dashboard and never caches it',async()=>{
  await request(app.getHttpServer()).get('/api/reports/operational/dashboard').expect(400);
  await request(app.getHttpServer()).get('/api/reports/operational/dashboard?sucursalId=s1')
   .expect(200).expect('Cache-Control','no-store');
  expect(svc.operational).toHaveBeenCalledWith(user,{sucursalId:'s1'});
 });
 it('validates period selection and passes a reporting query',async()=>{
  await request(app.getHttpServer()).get('/api/reports/analytics/overview?sucursalId=s1&periodo=INVALIDO').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/overview?sucursalId=s1&periodo=DIA&fecha=2026-10-30')
   .expect(200).expect('Cache-Control','no-store');
  expect(svc.overview).toHaveBeenCalledWith(user,expect.objectContaining({sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30'}));
 });
 it('exposes cash, payment methods and expense categories through no-store routes',async()=>{
  for(const route of ['payments-by-method','expenses-by-category','cash-shifts']){
   await request(app.getHttpServer()).get('/api/reports/analytics/'+route+
    '?sucursalId=s1&periodo=DIA&fecha=2026-10-30').expect(200)
    .expect('Cache-Control','no-store');
  }
  expect(svc.paymentsByMethod).toHaveBeenCalledOnce();
  expect(svc.expensesByCategory).toHaveBeenCalledOnce();
  expect(svc.cashShifts).toHaveBeenCalledOnce();
 });
 it('rejects oversized ticket queries and allows page/limit',async()=>{
  await request(app.getHttpServer()).get('/api/reports/analytics/tickets?sucursalId=s1&periodo=DIA&limit=500')
   .expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/tickets?sucursalId=s1&periodo=DIA&page=2&limit=10')
   .expect(200).expect('Cache-Control','no-store');
  expect(svc.tickets).toHaveBeenCalledWith(user,expect.objectContaining({page:2,limit:10}));
 });
});
