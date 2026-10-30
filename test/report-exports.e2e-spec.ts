import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service.js';
import {DomainReportsService} from '../src/modules/reports/application/domain-reports.service.js';
import {ReportExportController} from '../src/modules/reports/presentation/http/report-export.controller.js';
import {ReportExportService} from '../src/modules/reports/application/report-export.service.js';
const user:Principal={id:'u1',nombre:'Audit',email:'audit@example.com',
 sessionId:'sess',versionAutorizacion:1,debeCambiarContrasena:false};
const snapshot={source:'SALES_LINES',sucursal:{id:'s1',nombre:'Principal'},
 currency:'GTQ',periodo:{desde:'2026-10-30',hasta:'2026-10-30'},
 data:[{ventaId:'v1',ingreso:'11.00'}],meta:{total:1}};
describe('REP-2 protected export HTTP, attachment audit and validation',()=>{
 let app:INestApplication<App>;
 const exportRecords=vi.fn().mockResolvedValue(snapshot);
 const audit=vi.fn().mockResolvedValue({id:'audit1'});
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[ReportExportController],
   providers:[ReportExportService,
    {provide:DomainReportsService,useValue:{exportRecords}},
    {provide:PrismaService,useValue:{eventoAuditoria:{create:audit}}}]}).compile();
  app=mod.createNestApplication<App>();
  app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{
   req.auth=user;next();
  });
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,
   forbidNonWhitelisted:true,transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('streams UTF-8 CSV with no-store and persists audited hash',async()=>{
  const x=await request(app.getHttpServer()).get('/api/reports/analytics/exports/SALES_LINES'+
   '?sucursalId=s1&periodo=DIA&fecha=2026-10-30&format=CSV')
   .expect(200).expect('Cache-Control','private, no-store, max-age=0');
  expect(x.headers['content-type']).toMatch(/text\/csv/);
  expect(x.headers['content-disposition']).toMatch(/attachment; filename="Gastro_Core_SALES_LINES/);
  expect(x.headers['x-report-sha256']).toMatch(/^[0-9a-f]{64}$/);
  expect(audit).toHaveBeenCalledWith({data:expect.objectContaining({
   usuarioId:'u1',sucursalId:'s1',accion:'REP_EXPORT_GENERATED',
   entidad:'REPORTE',entidadId:'SALES_LINES',
   despues:expect.objectContaining({formato:'CSV',registros:1})
  })});
  expect(exportRecords).toHaveBeenCalledWith(user,'SALES_LINES',
   expect.objectContaining({sucursalId:'s1',periodo:'DIA',page:1,limit:100}));
 });
 it('downloads PDF as an attachment',async()=>{
  const x=await request(app.getHttpServer()).get('/api/reports/analytics/exports/SALES_LINES'+
   '?sucursalId=s1&periodo=DIA&fecha=2026-10-30&format=PDF').expect(200);
  expect(x.headers['content-type']).toMatch(/application\/pdf/);
  expect(x.headers['content-disposition']).toContain('.pdf');
  expect(audit).toHaveBeenCalledTimes(1);
 });
 it('rejects invalid format and absent branch before invoking report',async()=>{
  await request(app.getHttpServer()).get('/api/reports/analytics/exports/SALES_LINES'+
   '?sucursalId=s1&periodo=DIA&fecha=2026-10-30&format=TXT').expect(400);
  await request(app.getHttpServer()).get('/api/reports/analytics/exports/SALES_LINES'+
   '?periodo=DIA&fecha=2026-10-30&format=PDF').expect(400);
  expect(exportRecords).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
 });
});
