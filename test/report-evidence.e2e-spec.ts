import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {ReportEvidenceController} from '../src/modules/reports/presentation/http/report-evidence.controller.js';
import {ReportEvidenceService} from '../src/modules/reports/application/report-evidence.service.js';
const u:Principal={id:'user1',nombre:'Admin',email:'admin@dev.test',sessionId:'sess',
 versionAutorizacion:1,debeCambiarContrasena:false};
const service={
 cashShift:vi.fn().mockResolvedValue({version:'REP_EVIDENCE_V1',data:[],meta:{total:0}}),
 payments:vi.fn().mockResolvedValue({version:'REP_EVIDENCE_V1',data:[],meta:{total:0}}),
 expenses:vi.fn().mockResolvedValue({version:'REP_EVIDENCE_V1',data:[],meta:{total:0}})
};
describe('REP-A traceable source HTTP contract',()=>{
 let app:INestApplication<App>;
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[ReportEvidenceController],
   providers:[{provide:ReportEvidenceService,useValue:service}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=u;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('validates cash shift evidence and forwards branch-scoped pagination',async()=>{
  await request(app.getHttpServer()).get('/api/reports/analytics/cash-shifts/shift1/evidence').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/cash-shifts/shift1/evidence?sucursalId=s1&limit=1000').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/cash-shifts/shift1/evidence?sucursalId=s1&tipo=OTRO').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/cash-shifts/shift1/evidence?sucursalId=s1&page=2&limit=10&tipo=INGRESO')
   .expect(200).expect('Cache-Control','no-store');
  expect(service.cashShift).toHaveBeenCalledWith(u,'shift1',
   expect.objectContaining({sucursalId:'s1',page:2,limit:10,tipo:'INGRESO'}));
 });
 it('validates payment and expense source pages for Angular/Excel consumers',async()=>{
  for(const route of ['payments/records','expenses/records']){
   await request(app.getHttpServer()).get('/api/reports/analytics/'+route+
    '?sucursalId=s1&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&page=1&limit=20')
    .expect(200).expect('Cache-Control','no-store');
   await request(app.getHttpServer()).get('/api/reports/analytics/'+route+
    '?sucursalId=s1&periodo=DIA&page=1&limit=101').expect(400);
  }
  expect(service.payments).toHaveBeenCalledOnce();
  expect(service.expenses).toHaveBeenCalledOnce();
 });
});
