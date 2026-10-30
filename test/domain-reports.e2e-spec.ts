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
const fake={records:vi.fn().mockResolvedValue({source:'INVENTORY_MOVEMENTS',data:[],meta:{total:0}})};
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
 it('exposes all eight source-specific ledgers with consistent period/pagination',async()=>{
  for(const source of REPORT_SOURCES){
   await request(app.getHttpServer()).get('/api/reports/analytics/sources/'+source+
    '?sucursalId=s1&periodo=DIA&fecha=2026-10-30&page=1&limit=20')
    .expect(200).expect('Cache-Control','no-store');
   expect(fake.records).toHaveBeenCalledWith(u,source,expect.objectContaining({
    sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:20
   }));
  }
 });
 it('rejects unknown sources, missing branch, illegal ranges and overlarge pages',async()=>{
  await request(app.getHttpServer()).get('/api/reports/analytics/sources/FAKE?periodo=DIA&sucursalId=s1').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/sources/INVENTORY_MOVEMENTS?periodo=DIA').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/sources/INVENTORY_MOVEMENTS?sucursalId=s1&periodo=MES&limit=500').expect(400);
 });
});
