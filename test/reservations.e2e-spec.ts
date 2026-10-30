import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {Request,Response,NextFunction} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {ReservationsService} from '../src/modules/reservations/application/reservations.service.js';
import {ReservationsController} from '../src/modules/reservations/presentation/http/reservations.controller.js';
const actor:Principal={id:'admin',nombre:'Admin',email:'admin@dev.test',sessionId:'s',
 versionAutorizacion:1,debeCambiarContrasena:false};
const svc={availability:vi.fn().mockResolvedValue({mesas:[],sugerencias:[]}),
 list:vi.fn().mockResolvedValue({data:[],meta:{total:0}}),
 detail:vi.fn().mockResolvedValue({id:'r1',mesas:[{numero:'1'}],eventos:[]}),
 create:vi.fn().mockResolvedValue({id:'r1',estado:'CONFIRMADA'}),
 update:vi.fn().mockResolvedValue({id:'r1'}),
 confirm:vi.fn().mockResolvedValue({id:'r1',estado:'CONFIRMADA'}),
 cancel:vi.fn().mockResolvedValue({id:'r1',estado:'CANCELADA'}),
 noShow:vi.fn().mockResolvedValue({id:'r1',estado:'NO_ASISTIO'}),
 checkIn:vi.fn().mockResolvedValue({id:'r1',estado:'COMPLETADA',ocupaciones:[{id:'o1'}]})};
describe('RSV-A HTTP and enriched UI contracts',()=>{
 let app:INestApplication<App>;
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[ReservationsController],
   providers:[{provide:ReservationsService,useValue:svc}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=actor;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('requires branch and complete ISO date window for availability',async()=>{
  await request(app.getHttpServer()).get('/api/reservations/availability').expect(400);
  await request(app.getHttpServer()).get('/api/reservations/availability?sucursalId=s1&inicio=bad&fin=bad&personas=4').expect(400);
  await request(app.getHttpServer()).get('/api/reservations/availability?sucursalId=s1&inicio=2026-12-01T18:00:00Z&fin=2026-12-01T19:00:00Z&personas=4')
   .expect(200).expect('Cache-Control','no-store');
 });
 it('returns branch-scoped enriched list and detailed data',async()=>{
  await request(app.getHttpServer()).get('/api/reservations?sucursalId=s1').expect(200);
  await request(app.getHttpServer()).get('/api/reservations/r1').expect(200)
   .expect('Cache-Control','no-store');
  expect(svc.detail).toHaveBeenCalledWith(actor,'r1');
 });
 const valid={sucursalId:'s1',nombreContacto:'Ana Ejemplo',personas:2,
  inicio:'2026-12-01T18:00:00Z',fin:'2026-12-01T20:00:00Z',claveOperacion:'RSV:HTTP:001'};
 it('creates confirmed reservation directly, without an extra approval',async()=>{
  await request(app.getHttpServer()).post('/api/reservations').send(valid).expect(201);
  expect(svc.create).toHaveBeenCalledWith(actor,expect.objectContaining(valid));
  await request(app.getHttpServer()).post('/api/reservations')
   .send({...valid,personas:0}).expect(400);
  await request(app.getHttpServer()).post('/api/reservations')
   .send({...valid,provider:'SMS'}).expect(400);
 });
 it('validates editable fields and reason lengths',async()=>{
  await request(app.getHttpServer()).patch('/api/reservations/r1')
   .send({personas:3,mesaIds:['t1']}).expect(200);
  await request(app.getHttpServer()).post('/api/reservations/r1/cancel')
   .send({motivo:'No'}).expect(400);
  await request(app.getHttpServer()).post('/api/reservations/r1/cancel')
   .send({motivo:'Cliente canceló'}).expect(201);
 });
 it('checks in with one action and permits optional confirmation and no-show',async()=>{
  await request(app.getHttpServer()).post('/api/reservations/r1/check-in').expect(201);
  expect(svc.checkIn).toHaveBeenCalledExactlyOnceWith(actor,'r1');
  await request(app.getHttpServer()).post('/api/reservations/r1/confirm').expect(201);
  await request(app.getHttpServer()).post('/api/reservations/r1/no-show')
   .send({motivo:'El cliente no asistió'}).expect(201);
 });
});
