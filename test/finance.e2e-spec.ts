import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import {FinanceAccountsController} from '../src/modules/finance/finance.controller.js';
import {FinanceStore} from '../src/modules/finance/finance.store.js';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
const user:Principal={id:'u1',email:'admin@example.test',nombre:'Admin',sessionId:'session',
 debeCambiarContrasena:false,versionAutorizacion:1};
describe('FIN-A HTTP DTO contracts',()=>{
 let app:INestApplication<App>;
 const methods={accounts:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createAccount:vi.fn().mockResolvedValue({id:'account-1',saldoRegistrado:'0.00'}),
  account:vi.fn().mockResolvedValue({id:'account-1',saldoRegistrado:'0.00'}),
  movements:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}})};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const testing=await Test.createTestingModule({
   controllers:[FinanceAccountsController],providers:[{provide:FinanceStore,useValue:methods}]
  }).compile();
  app=testing.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('requires branch in account lists',async()=>{
  await request(app.getHttpServer()).get('/api/finance/accounts').expect(400);
  await request(app.getHttpServer()).get('/api/finance/accounts?sucursalId=branch').expect(200);
  expect(methods.accounts).toHaveBeenCalledOnce();
 });
 it('accepts typed idempotent account creation and rejects unrecognized account classes',async()=>{
  const d={claveOperacion:'FIN:ACCOUNT:0001',sucursalId:'branch',nombre:'Banco empresa',tipo:'BANCO'};
  await request(app.getHttpServer()).post('/api/finance/accounts').send(d).expect(201);
  expect(methods.createAccount).toHaveBeenCalledOnce();
  await request(app.getHttpServer()).post('/api/finance/accounts').send({...d,tipo:'OTRO'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/accounts').send({...d,extra:true}).expect(400);
 });
 it('exposes account detail and paginated movements',async()=>{
  await request(app.getHttpServer()).get('/api/finance/accounts/a').expect(200);
  await request(app.getHttpServer()).get('/api/finance/accounts/a/movements?page=1&limit=25').expect(200);
  await request(app.getHttpServer()).get('/api/finance/accounts/a/movements?limit=101').expect(400);
  expect(methods.movements).toHaveBeenCalledOnce();
 });
});