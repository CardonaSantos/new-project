import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {DeliverySettlementsController} from '../src/modules/delivery/presentation/http/delivery-settlements.controller.js';
import {DeliverySettlementsService} from '../src/modules/delivery/application/delivery-settlements.service.js';
const u:Principal={id:'admin',email:'admin@example.test',nombre:'Admin',sessionId:'s',
 versionAutorizacion:1,debeCambiarContrasena:false};
describe('DEL-A D3 hexagonal HTTP contracts',()=>{
 let app:INestApplication<App>;
 const stub={
  cash:vi.fn().mockResolvedValue({pagoId:'payment',monto:'22.00'}),
  pending:vi.fn().mockResolvedValue({data:[],meta:{total:0}}),
  createCourier:vi.fn().mockResolvedValue({id:'settlement',totalEsperado:'22.00'}),
  closeCourier:vi.fn().mockResolvedValue({id:'settlement',movimientoCajaId:'movement'}),
  discrepancy:vi.fn().mockResolvedValue({id:'settlement',estado:'ABIERTA',diferencia:'1.00'}),
  courierDetail:vi.fn().mockResolvedValue({id:'settlement',estado:'CERRADA'}),
  platformChannels:vi.fn().mockResolvedValue({data:[]}),
  registerChannel:vi.fn().mockResolvedValue({id:'channel'}),
  createPlatform:vi.fn().mockResolvedValue({id:'platform',totalNeto:'20.00'}),
  platformDetail:vi.fn().mockResolvedValue({id:'platform'})
 };
 const key={claveOperacion:'D3:TEST:001'};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const module=await Test.createTestingModule({controllers:[DeliverySettlementsController],
   providers:[{provide:DeliverySettlementsService,useValue:stub}]}).compile();
  app=module.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{
   req.auth=u;next();
  });
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('collects street cash without asking for a shift',async()=>{
  await request(app.getHttpServer()).post('/api/deliveries/entrega/collect-cash')
   .send({...key,cuentaId:'account',monto:'22.00'}).expect(201);
  expect(stub.cash).toHaveBeenCalledWith(u,'entrega',expect.objectContaining({
   monto:'22.00',cuentaId:'account'
  }));
  await request(app.getHttpServer()).post('/api/deliveries/entrega/collect-cash')
   .send({...key,cuentaId:'account',monto:'1e5'}).expect(400);
 });
 it('creates and closes a single courier settlement',async()=>{
  await request(app.getHttpServer()).post('/api/deliveries/settlements/couriers')
   .send({...key,sucursalId:'s1',repartidorId:'courier',pagoIds:['p1']}).expect(201);
  await request(app.getHttpServer()).post('/api/deliveries/settlements/couriers/settlement/close')
   .send({...key,turnoCajaId:'shift',totalEntregado:'22.00'}).expect(201);
  await request(app.getHttpServer()).post('/api/deliveries/settlements/couriers/settlement/close')
   .send({...key,turnoCajaId:'shift',totalEntregado:'-1'}).expect(400);
  await request(app.getHttpServer()).post('/api/deliveries/settlements/couriers/settlement/discrepancy')
   .send({...key,montoDeclarado:'21.00',motivo:'Faltante de prueba documentado'}).expect(201);
  expect(stub.discrepancy).toHaveBeenCalledOnce();
  expect(stub.closeCourier).toHaveBeenCalledOnce();
 });
 it('requires valid platform periods and commission decimals',async()=>{
  const req={...key,sucursalId:'s1',canalId:'channel',cuentaFinancieraId:'bank',
   periodoInicio:'2026-10-29',periodoFin:'2026-10-29',referencia:'BANK-DEV-001',
   lineas:[{entregaId:'delivery',cuentaId:'account',importeBruto:'22.00',comision:'2.00'}]};
  await request(app.getHttpServer()).post('/api/deliveries/settlements/platforms')
   .send(req).expect(201);
  await request(app.getHttpServer()).post('/api/deliveries/settlements/platforms')
   .send({...req,lineas:[{...req.lineas[0],comision:'1.005'}]}).expect(400);
  await request(app.getHttpServer()).post('/api/deliveries/settlements/platforms')
   .send({...req,extraSensitiveData:'x'}).expect(400);
 });
 it('handles platform channel registration and list with scoped branch',async()=>{
  await request(app.getHttpServer()).get('/api/deliveries/settlements/platforms/channels')
   .expect(400);
  await request(app.getHttpServer()).get('/api/deliveries/settlements/platforms/channels?sucursalId=s1')
   .expect(200);
  await request(app.getHttpServer()).post('/api/deliveries/settlements/platforms/channels')
   .send({...key,sucursalId:'s1',codigo:'TEST_DEV',nombre:'Plataforma DEV'}).expect(201);
 });
});
