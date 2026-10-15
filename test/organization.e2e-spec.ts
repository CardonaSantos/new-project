import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {OrganizationController} from '../src/modules/organization/presentation/http/organization.controller.js';
import {BranchesController} from '../src/modules/organization/presentation/http/branches.controller.js';
import {DevicesController} from '../src/modules/organization/presentation/http/devices.controller.js';
import {OrganizationService} from '../src/modules/organization/application/organization.service.js';

const actor:Principal={id:'test-admin',email:'admin@example.com',nombre:'Admin',
 sessionId:'session-test',debeCambiarContrasena:false,versionAutorizacion:1};

describe('Organization HTTP routes (controller contracts)',()=>{
 let app:INestApplication<App>;
 const service={
  company:vi.fn().mockResolvedValue({id:'company',nombreComercial:'Gastro Core'}),
  branches:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  branchOptions:vi.fn().mockResolvedValue({data:[],meta:{hasMore:false,nextCursor:null}}),
  myAccess:vi.fn().mockResolvedValue({data:[]}),
  createBranch:vi.fn().mockResolvedValue({id:'branch-1',codigo:'CENTRAL'}),
  devices:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  deviceOptions:vi.fn().mockResolvedValue({data:[],meta:{hasMore:false,nextCursor:null}}),
  createDevice:vi.fn().mockResolvedValue({id:'device-1',codigo:'POS-01'})
 };
 beforeEach(async()=>{
  vi.clearAllMocks();
  const module=await Test.createTestingModule({
   controllers:[OrganizationController,BranchesController,DevicesController],
   providers:[{provide:OrganizationService,useValue:service}]
  }).compile();
  app=module.createNestApplication<App>();
  app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{
   req.auth=actor;next();
  });
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('registra la configuración empresarial',async()=>{
  await request(app.getHttpServer()).get('/api/organization')
   .expect(200).expect({id:'company',nombreComercial:'Gastro Core'});
 });
 it('registra el selector de sucursales antes del parámetro dinámico',async()=>{
  await request(app.getHttpServer()).get('/api/branches/options?limit=10').expect(200);
  expect(service.branchOptions).toHaveBeenCalledWith(actor,expect.objectContaining({limit:10}));
 });
 it('registra el selector de sucursales accesibles',async()=>{
  await request(app.getHttpServer()).get('/api/branches/my-access').expect(200).expect({data:[]});
 });
 it('crea sucursal con DTO válido y rechaza el código inválido',async()=>{
  await request(app.getHttpServer()).post('/api/branches')
   .send({codigo:'CENTRAL',nombre:'Central'}).expect(201);
  await request(app.getHttpServer()).post('/api/branches')
   .send({codigo:'1',nombre:'Central'}).expect(400);
  expect(service.createBranch).toHaveBeenCalledTimes(1);
 });
 it('rechaza filtros mal formados para listados',async()=>{
  await request(app.getHttpServer()).get('/api/branches?activo=tampoco').expect(400);
  await request(app.getHttpServer()).get('/api/devices?limit=900').expect(400);
 });
 it('registra dispositivos y valida su tipo',async()=>{
  await request(app.getHttpServer()).post('/api/devices').send({
   sucursalId:'branch-1',codigo:'POS-01',nombre:'POS principal',tipo:'POS'
  }).expect(201);
  await request(app.getHttpServer()).post('/api/devices').send({
   sucursalId:'branch-1',codigo:'POS-02',nombre:'POS dos',tipo:'DESCONOCIDO'
  }).expect(400);
  expect(service.createDevice).toHaveBeenCalledTimes(1);
 });
});
