import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import {FinanceAccountsController,FinanceExpensesController,FinanceIntentsController,FinanceReconciliationController,FinanceRoutingController}
 from '../src/modules/finance/finance.controller.js';
import {FinanceStore} from '../src/modules/finance/finance.store.js';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
const user:Principal={id:'u1',email:'admin@example.test',nombre:'Admin',sessionId:'session',
 debeCambiarContrasena:false,versionAutorizacion:1};
const operationId='FIN:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
describe('FIN-A HTTP DTO contracts',()=>{
 let app:INestApplication<App>;
 const methods={
  issueIntent:vi.fn().mockResolvedValue({operationId}),
  accounts:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createAccount:vi.fn().mockResolvedValue({id:'account-1',saldoRegistrado:'0.00'}),
  account:vi.fn().mockResolvedValue({id:'account-1',saldoRegistrado:'0.00'}),
  movements:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  expenses:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  createExpense:vi.fn().mockResolvedValue({id:'expense-1',estado:'REGISTRADO'}),
  expense:vi.fn().mockResolvedValue({id:'expense-1'}),
  pendingExternal:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  postExternal:vi.fn().mockResolvedValue({movimientoId:'movement-1',registrado:true}),
  financialRoutes:vi.fn().mockResolvedValue({data:[]}),
  upsertFinancialRoute:vi.fn().mockResolvedValue({id:'route-1'})
 };
 beforeEach(async()=>{
  vi.clearAllMocks();
  const testing=await Test.createTestingModule({
   controllers:[FinanceIntentsController,FinanceAccountsController,FinanceExpensesController,FinanceReconciliationController,FinanceRoutingController],
   providers:[{provide:FinanceStore,useValue:methods}]
  }).compile();
  app=testing.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('requires branch on paginated account and expense lists',async()=>{
  await request(app.getHttpServer()).get('/api/finance/accounts').expect(400);
  await request(app.getHttpServer()).get('/api/finance/accounts?sucursalId=branch').expect(200);
  await request(app.getHttpServer()).get('/api/finance/expenses').expect(400);
  await request(app.getHttpServer()).get('/api/finance/expenses?sucursalId=branch').expect(200);
  expect(methods.accounts).toHaveBeenCalledOnce();
  expect(methods.expenses).toHaveBeenCalledOnce();
 });
 it('issues server-managed operation IDs for a branch/action',async()=>{
  await request(app.getHttpServer()).post('/api/finance/operation-intents')
   .send({sucursalId:'branch',accion:'FIN_EXPENSE_CREATE'}).expect(201);
  await request(app.getHttpServer()).post('/api/finance/operation-intents')
   .send({sucursalId:'branch',accion:'ANOTHER_ACTION'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/operation-intents')
   .send({sucursalId:'branch',accion:'FIN_EXTERNAL_POST'}).expect(201);
  expect(methods.issueIntent).toHaveBeenCalledTimes(2);
 });
 it('requires a server-issued identifier in typed account registration',async()=>{
  const d={operationId,sucursalId:'branch',nombre:'Banco empresa',tipo:'BANCO'};
  await request(app.getHttpServer()).post('/api/finance/accounts').send(d).expect(201);
  expect(methods.createAccount).toHaveBeenCalledOnce();
  await request(app.getHttpServer()).post('/api/finance/accounts').send({...d,tipo:'OTRO'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/accounts')
   .send({...d,operationId:'user-made-key'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/accounts')
   .send({...d,claveOperacion:'unneeded'}).expect(400);
 });
 it('validates cash and bank expenses, forbidding unknown fields and invalid amounts',async()=>{
  const d={operationId,sucursalId:'branch',origen:'CAJA',
   monto:'75.00',descripcion:'Artículos de limpieza',turnoId:'shift-1'};
  await request(app.getHttpServer()).post('/api/finance/expenses').send(d).expect(201);
  await request(app.getHttpServer()).post('/api/finance/expenses')
   .send({...d,monto:'-75'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/expenses')
   .send({...d,origen:'OTRO'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/expenses')
   .send({...d,extra:true}).expect(400);
  expect(methods.createExpense).toHaveBeenCalledOnce();
 });
 it('exposes account movements and expense details',async()=>{
  await request(app.getHttpServer()).get('/api/finance/accounts/a').expect(200);
  await request(app.getHttpServer()).get('/api/finance/accounts/a/movements?page=1&limit=25').expect(200);
  await request(app.getHttpServer()).get('/api/finance/accounts/a/movements?limit=101').expect(400);
  await request(app.getHttpServer()).get('/api/finance/expenses/e').expect(200);
  expect(methods.movements).toHaveBeenCalledOnce();
  expect(methods.expense).toHaveBeenCalledOnce();
 });
 it('validates external financial source posting and source-scoped pending listing',async()=>{
  await request(app.getHttpServer()).get('/api/finance/reconciliation/pending?sucursalId=branch')
   .expect(400);
  await request(app.getHttpServer()).get('/api/finance/reconciliation/pending?sucursalId=branch&sourceType=PAGO')
   .expect(200);
  const d={operationId,sucursalId:'branch',sourceType:'PAGO',
   sourceId:'payment-1',cuentaFinancieraId:'financial-account-1'};
  await request(app.getHttpServer()).post('/api/finance/reconciliation/post').send(d)
   .expect(201);
  await request(app.getHttpServer()).post('/api/finance/reconciliation/post')
   .send({...d,sourceType:'EFECTIVO'}).expect(400);
  await request(app.getHttpServer()).post('/api/finance/reconciliation/post')
   .send({...d,operationId:'inventado'}).expect(400);
  expect(methods.postExternal).toHaveBeenCalledOnce();
 });

 it('exposes branch financial routes and validates one-time setup',async()=>{
  await request(app.getHttpServer()).get('/api/finance/routing').expect(400);
  await request(app.getHttpServer()).get('/api/finance/routing?sucursalId=branch').expect(200);
  const d={operationId,sucursalId:'branch',metodo:'TARJETA',
   cuentaFinancieraId:'financial-account-1',activa:true};
  await request(app.getHttpServer()).put('/api/finance/routing').send(d).expect(200);
  await request(app.getHttpServer()).put('/api/finance/routing')
   .send({...d,metodo:'EFECTIVO'}).expect(400);
  expect(methods.financialRoutes).toHaveBeenCalledOnce();
  expect(methods.upsertFinancialRoute).toHaveBeenCalledOnce();
 });

});
