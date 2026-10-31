import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {DomainReportsController} from '../src/modules/reports/presentation/http/domain-reports.controller.js';
import {DomainReportsService} from '../src/modules/reports/application/domain-reports.service.js';
import {DomainReportsPort,REPORT_SOURCES} from '../src/modules/reports/application/ports/domain-reports.port.js';
const u:Principal={id:'u1',nombre:'Admin',email:'admin@dev.example',
 sessionId:'sess',versionAutorizacion:1,debeCambiarContrasena:false};
const fake={records:vi.fn().mockResolvedValue({source:'INVENTORY_MOVEMENTS',data:[],meta:{total:0}}),
 consolidated:vi.fn().mockResolvedValue({source:'BRANCH_ROLLUP',data:[],totalesPorMoneda:[]})};
describe('REP-A transversal evidence API',()=>{
 let app:INestApplication<App>;
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[DomainReportsController],
   providers:[DomainReportsService,{provide:DomainReportsPort,useValue:fake}]}).compile();
  app=mod.createNestApplication<App>();
  app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=u;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,
   forbidNonWhitelisted:true,transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('exposes fifteen source-specific ledgers including R5 reconciliation with consistent period/pagination',async()=>{
  for(const source of REPORT_SOURCES){
   await request(app.getHttpServer()).get('/api/reports/analytics/sources/'+source+
    '?sucursalId=s1&periodo=DIA&fecha=2026-10-30&page=1&limit=20')
    .expect(200).expect('Cache-Control','no-store');
   expect(fake.records).toHaveBeenCalledWith(u,source,expect.objectContaining({
    sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:20
   }));
  }
 });
 it('binds R6 fixed multi-branch route before dynamic source route',async()=>{
  await request(app.getHttpServer())
   .get('/api/reports/analytics/sources/consolidated?sucursalIds=s1,s2&periodo=DIA&fecha=2026-10-30')
   .expect(200).expect('Cache-Control','no-store');
  expect(fake.consolidated).toHaveBeenCalledWith(u,expect.objectContaining({
   sucursalIds:'s1,s2',periodo:'DIA',fecha:'2026-10-30'}));
  expect(fake.records).not.toHaveBeenCalled();
 });
 it('rejects malformed R6 branch list before domain execution',async()=>{
  await request(app.getHttpServer())
   .get('/api/reports/analytics/sources/consolidated?sucursalIds=s1,s2,s3,s4,s5,s6,s7,s8,s9,s10,s11&periodo=DIA&fecha=2026-10-30')
   .expect(400);
  await request(app.getHttpServer())
   .get('/api/reports/analytics/sources/consolidated?periodo=DIA&fecha=2026-10-30')
   .expect(400);
  expect(fake.consolidated).not.toHaveBeenCalled();
 });
 it('rejects unknown sources, missing branch, illegal ranges and overlarge pages',async()=>{
  await request(app.getHttpServer()).get('/api/reports/analytics/sources/FAKE?periodo=DIA&sucursalId=s1').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/sources/INVENTORY_MOVEMENTS?periodo=DIA').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/sources/INVENTORY_MOVEMENTS?sucursalId=s1&periodo=MES&limit=500').expect(400);
 });
});
