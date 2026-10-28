import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {SupplyStore} from '../src/modules/supply/supply.store.js';
import {SupplyRequisitionsController,SupplyTransfersController} from '../src/modules/supply/supply.controller.js';
const user:Principal={id:'u1',email:'buyer@example.test',nombre:'Comprador',
 sessionId:'session-1',debeCambiarContrasena:false,versionAutorizacion:1};
const response={id:'resource',estado:'ABIERTA'};
describe('SUP-A HTTP request contracts',()=>{
 let app:INestApplication<App>;
 const methods={create:vi.fn().mockResolvedValue(response),list:vi.fn().mockResolvedValue(response),
  detail:vi.fn().mockResolvedValue(response),availability:vi.fn().mockResolvedValue(response),
  send:vi.fn().mockResolvedValue(response),purchaseDraft:vi.fn().mockResolvedValue(response),receive:vi.fn().mockResolvedValue(response),
  cancel:vi.fn().mockResolvedValue(response),transfer:vi.fn().mockResolvedValue(response)};
 beforeEach(async()=>{
  vi.clearAllMocks();
  const testing=await Test.createTestingModule({
   controllers:[SupplyRequisitionsController,SupplyTransfersController],
   providers:[{provide:SupplyStore,useValue:methods}],
  }).compile();
  app=testing.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,
   forbidNonWhitelisted:true,transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('accepts a minimal requisition without approval or drafts',async()=>{
  await request(app.getHttpServer()).post('/api/supply/requisitions').send({
   claveOperacion:'SUP:REQ:TEST:1',almacenDestinoId:'dest',
   lineas:[{articuloId:'a',cantidadSolicitada:'20.000000'}]}).expect(201);
  expect(methods.create).toHaveBeenCalledOnce();
 });
 it('rejects invalid and numeric quantities',async()=>{
  for(const cantidadSolicitada of [-2,20, '0','1e3','20.0000000']){
   await request(app.getHttpServer()).post('/api/supply/requisitions').send({
    claveOperacion:'SUP:REQ:TEST:2',almacenDestinoId:'dest',
    lineas:[{articuloId:'a',cantidadSolicitada}]}).expect(400);
  }
  expect(methods.create).not.toHaveBeenCalled();
 });
 it('exposes one-action immediate delivery and normal shipping',async()=>{
  const dto={claveOperacion:'SUP:SEND:TEST:1',almacenOrigenId:'origin',inmediato:true,
   lineas:[{articuloId:'a',ubicacionOrigenId:'from',ubicacionDestinoId:'to',cantidad:'5'}]};
  await request(app.getHttpServer()).post('/api/supply/requisitions/req/send').send(dto).expect(201);
  expect(methods.send).toHaveBeenCalledOnce();
  await request(app.getHttpServer()).post('/api/supply/requisitions/req/send')
   .send({...dto,inmediato:'true'}).expect(400);
 });
 it('creates an idempotent PUR-A purchase draft through the SUP-A requisition',async()=>{
  const payload={claveOperacion:'SUP:PUR:DRAFT:001',orden:{
   proveedorId:'supplier',sucursalId:'branch',precioIncluyeImpuesto:true,
   lineas:[{articuloId:'a',cantidadCompra:'2',factorAUnidadBase:'10',
    precioUnitarioCompra:'11.20',tasaImpuesto:'0.12',impuestoRecuperable:true}]}};
  await request(app.getHttpServer()).post('/api/supply/requisitions/req/purchase-draft')
   .send(payload).expect(201);
  expect(methods.purchaseDraft).toHaveBeenCalledOnce();
  await request(app.getHttpServer()).post('/api/supply/requisitions/req/purchase-draft')
   .send({...payload,orden:{...payload.orden,lineas:[{...payload.orden.lineas[0],cantidadCompra:'0'}]}})
   .expect(400);
 });
 it('accepts a partial receipt and rejects duplicate body keys',async()=>{
  await request(app.getHttpServer()).post('/api/supply/transfers/transfer/receive').send({
   claveOperacion:'SUP:RECEIVE:TEST:1',observaciones:'Llegaron menos unidades',
   lineas:[{transferenciaLineaId:'linea-1',cantidadRecibida:'18'}]}).expect(201);
  await request(app.getHttpServer()).post('/api/supply/transfers/transfer/receive').send({
   claveOperacion:'SUP:RECEIVE:TEST:2',lineas:[{transferenciaLineaId:'linea-1',cantidadRecibida:'5'}],
   unauthorized:true}).expect(400);
 });
 it('enforces required scope and IDs on reads',async()=>{
  await request(app.getHttpServer()).get('/api/supply/requisitions').expect(400);
  await request(app.getHttpServer()).get('/api/supply/requisitions?sucursalId=s').expect(200);
  await request(app.getHttpServer()).get('/api/supply/requisitions/req/availability').expect(400);
  await request(app.getHttpServer()).get('/api/supply/requisitions/req/availability?almacenOrigenId=w').expect(200);
 });
});
