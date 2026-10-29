import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {FinanceClosingService} from '../src/modules/finance/application/finance-closing.service.js';
import {FinanceBankService} from '../src/modules/finance/application/finance-bank.service.js';
import {FinanceClosingController} from '../src/modules/finance/presentation/http/finance-closing.controller.js';
import {FinanceBankController,FinanceReverseController} from '../src/modules/finance/presentation/http/finance-bank.controller.js';
const principal={id:'u1'} as Principal;
const operationId='FIN:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
describe('FIN-A phase four HTTP contracts',()=>{
 let app:INestApplication<App>;
 const closing={preview:vi.fn().mockResolvedValue({cerrado:false}),
  confirm:vi.fn().mockResolvedValue({id:'closing-1'}),
  detail:vi.fn().mockResolvedValue({id:'closing-1'})};
 const bank={list:vi.fn().mockResolvedValue({data:[]}),
  unmatched:vi.fn().mockResolvedValue({data:[]}),
  importLines:vi.fn().mockResolvedValue({importadas:1}),
  match:vi.fn().mockResolvedValue({estado:'CONCILIADO'}),
  unmatch:vi.fn().mockResolvedValue({estado:'PENDIENTE'}),
  reverse:vi.fn().mockResolvedValue({reversaId:'reverse-1'})};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({
   controllers:[FinanceClosingController,FinanceBankController,FinanceReverseController],
   providers:[{provide:FinanceClosingService,useValue:closing},{provide:FinanceBankService,useValue:bank}]
  }).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{
   req.auth=principal;next();
  });
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('validates closing preview and server-generated operation ID',async()=>{
  await request(app.getHttpServer()).get('/api/finance/closing/preview?fechaOperativa=2026-10-28')
   .expect(400);
  await request(app.getHttpServer()).get('/api/finance/closing/preview?sucursalId=b&fechaOperativa=2026-10-28')
   .expect(200);
  await request(app.getHttpServer()).post('/api/finance/closing')
   .send({operationId:'forged',sucursalId:'b',fechaOperativa:'2026-10-28'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/closing')
   .send({operationId,sucursalId:'b',fechaOperativa:'2026-10-28'}).expect(201);
  expect(closing.confirm).toHaveBeenCalledOnce();
 });
 it('validates signed statement lines and allows one verified import',async()=>{
  const data={operationId,sucursalId:'b',cuentaFinancieraId:'bank',
   lineas:[{claveExterna:'BANK-001',fecha:'2026-10-28',monto:'-5.00'}]};
  await request(app.getHttpServer()).post('/api/finance/bank-statements/import').send(data).expect(201);
  await request(app.getHttpServer()).post('/api/finance/bank-statements/import')
   .send({...data,lineas:[{...data.lineas[0],monto:'5.001'}]}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/bank-statements/import')
   .send({...data,lineas:[]}).expect(400);
  expect(bank.importLines).toHaveBeenCalledOnce();
 });
 it('provides bank and unmatched ledger pagination with branch controls',async()=>{
  await request(app.getHttpServer()).get('/api/finance/bank-statements').expect(400);
  await request(app.getHttpServer()).get('/api/finance/bank-statements?sucursalId=b&cuentaFinancieraId=a')
   .expect(200);
  await request(app.getHttpServer()).get('/api/finance/bank-statements/ledger-pending?sucursalId=b&cuentaFinancieraId=a')
   .expect(200);
  await request(app.getHttpServer()).get('/api/finance/bank-statements?cuentaFinancieraId=a&sucursalId=b&limit=101')
   .expect(400);
 });
 it('validates matching, unmatched correction and reversal reason',async()=>{
  await request(app.getHttpServer()).post('/api/finance/bank-statements/match')
   .send({operationId,sucursalId:'b',lineaId:'x',movimientoId:'m'}).expect(201);
  await request(app.getHttpServer()).post('/api/finance/bank-statements/unmatch')
   .send({operationId,sucursalId:'b',lineaId:'x',motivo:'Corrección de conciliación'}).expect(201);
  await request(app.getHttpServer()).post('/api/finance/reversals')
   .send({operationId,sucursalId:'b',movimientoId:'m',motivo:'Corte'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/reversals')
   .send({operationId,sucursalId:'b',movimientoId:'m',motivo:'Corrección aprobada por contabilidad'}).expect(201);
  expect(bank.reverse).toHaveBeenCalledOnce();
 });
});
