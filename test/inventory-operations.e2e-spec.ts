import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {InventoryOperationsService} from '../src/modules/inventory/application/inventory-operations.service.js';
import {InventoryStockController,InventoryLotsController,InventoryManualController,InventoryMovementsController,
 InventoryCountsController,InventoryTransfersController,InventoryOperationalReportsController
} from '../src/modules/inventory/presentation/http/inventory-operations.controller.js';
const actor:Principal={id:'u1',email:'admin@example.test',nombre:'Admin',sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
describe('INV-B HTTP validation and route contracts',()=>{
 let app:INestApplication<App>;
 const store={
  stock:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  summary:vi.fn().mockResolvedValue({totalArticulos:0,data:[]}),
  createLot:vi.fn().mockResolvedValue({id:'l1'}),lots:vi.fn().mockResolvedValue({data:[]}),
  manual:vi.fn().mockResolvedValue({movementId:'m1',cantidad:'5.000000'}),
  movements:vi.fn().mockResolvedValue({data:[]}),movement:vi.fn().mockResolvedValue({id:'m1'}),
  createCount:vi.fn().mockResolvedValue({id:'c1'}),confirmCount:vi.fn().mockResolvedValue({id:'c1'}),
  count:vi.fn().mockResolvedValue({id:'c1'}),
  createTransfer:vi.fn().mockResolvedValue({id:'t1'}),transfer:vi.fn().mockResolvedValue({id:'t1'}),
  dispatch:vi.fn().mockResolvedValue({estado:'EN_TRANSITO'}),receive:vi.fn().mockResolvedValue({estado:'RECIBIDA'}),
  cancelCount:vi.fn().mockResolvedValue({id:'c1',estado:'CANCELADO'}),
  cancelTransfer:vi.fn().mockResolvedValue({id:'t1',estado:'CANCELADA'}),
  valuation:vi.fn().mockResolvedValue({valorInventario:'0.000000'}),
  expiry:vi.fn().mockResolvedValue({lotes:[]}),reconciliation:vi.fn().mockResolvedValue({conciliado:true}),
  blockLot:vi.fn().mockResolvedValue({bloqueado:true})
 };
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[
   InventoryStockController,InventoryLotsController,InventoryMovementsController,
   InventoryManualController,InventoryCountsController,InventoryTransfersController,
   InventoryOperationalReportsController
  ],providers:[{provide:InventoryOperationsService,useValue:store}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=actor;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 it('validates query and returns paginated stock',async()=>{
  await request(app.getHttpServer()).get('/api/inventory/stock?sucursalId=b1').expect(200);
  expect(store.stock).toHaveBeenCalled();
  await request(app.getHttpServer()).get('/api/inventory/stock?page=0&sucursalId=b1').expect(400);
  await request(app.getHttpServer()).get('/api/inventory/stock').expect(400);
 });
 it('allows a valid opening and rejects invalid quantity and negative cost',async()=>{
  const entry={articuloId:'a1',ubicacionId:'u1',cantidad:'5.250000',costoUnitario:'1.250000',
   claveOperacion:'TEST:OPEN:1',motivo:'Carga inicial'};
  await request(app.getHttpServer()).post('/api/inventory/operations/opening').send(entry).expect(201);
  expect(store.manual).toHaveBeenCalledWith(actor,'OPENING',expect.objectContaining({cantidad:'5.250000'}));
  await request(app.getHttpServer()).post('/api/inventory/operations/opening')
   .send({...entry,cantidad:'-2'}).expect(400);
  await request(app.getHttpServer()).post('/api/inventory/operations/opening')
   .send({...entry,costoUnitario:'-3.00'}).expect(400);
 });
 it('validates nested transfer and count rows',async()=>{
  await request(app.getHttpServer()).post('/api/inventory/transfers').send({
   almacenOrigenId:'w1',almacenDestinoId:'w2',nota:'Mover insumos',
   lineas:[{articuloId:'a1',ubicacionOrigenId:'l1',ubicacionDestinoId:'l2',cantidad:'3.000000'}]
  }).expect(201);
  await request(app.getHttpServer()).post('/api/inventory/transfers').send({
   almacenOrigenId:'w1',almacenDestinoId:'w2',nota:'Mover insumos',
   lineas:[{articuloId:'a1',ubicacionOrigenId:'l1',ubicacionDestinoId:'l2',cantidad:'0.0.1'}]
  }).expect(400);
  await request(app.getHttpServer()).post('/api/inventory/counts').send({
   almacenId:'w1',nota:'Conteo físico',
   lineas:[{articuloId:'a1',ubicacionId:'l1',cantidadContada:'0'}]
  }).expect(201);
 });
 it('supports cancelling draft documents without posting stock',async()=>{
  await request(app.getHttpServer()).post('/api/inventory/counts/c1/cancel')
   .expect(201).expect({id:'c1',estado:'CANCELADO'});
  await request(app.getHttpServer()).post('/api/inventory/transfers/t1/cancel')
   .expect(201).expect({id:'t1',estado:'CANCELADA'});
  expect(store.cancelCount).toHaveBeenCalledWith(actor,'c1');
  expect(store.cancelTransfer).toHaveBeenCalledWith(actor,'t1');
 });
 it('keeps valuation and reconciliation routes distinct',async()=>{
  await request(app.getHttpServer()).get('/api/inventory/reports/valuation?sucursalId=b1')
   .expect(200).expect({valorInventario:'0.000000'});
  await request(app.getHttpServer()).get('/api/inventory/reports/reconciliation?sucursalId=b1')
   .expect(200).expect({conciliado:true});
 });
});
