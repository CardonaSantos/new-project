
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {SuppliersController,PresentationsController,PurchaseOrdersController,
 PurchaseReceiptsController,PurchaseInvoicesController,PurchasePaymentsController,
 PurchaseReturnsController,PurchaseCreditsController,PurchaseSupplierRefundsController}
 from '../src/modules/purchases/presentation/http/purchases.controller.js';
import {PurchaseMastersService} from '../src/modules/purchases/application/purchase-masters.service.js';
import {PurchaseOrdersService} from '../src/modules/purchases/application/purchase-orders.service.js';
import {PurchaseReceiptsService} from '../src/modules/purchases/application/purchase-receipts.service.js';
import {PurchaseInvoicesService} from '../src/modules/purchases/application/purchase-invoices.service.js';
import {PurchasePaymentsService} from '../src/modules/purchases/application/purchase-payments.service.js';
import {PurchaseReturnsService} from '../src/modules/purchases/application/purchase-returns.service.js';
const user:Principal={id:'u1',email:'buyer@example.test',nombre:'Comprador',sessionId:'s1',
 debeCambiarContrasena:false,versionAutorizacion:1};
const success=vi.fn().mockResolvedValue({id:'record'});
describe('PUR-A HTTP DTO validation and route boundaries',()=>{
 let app:INestApplication<App>;
 const mocks=[
  {provide:PurchaseMastersService,useValue:{createSupplier:success,suppliers:success,
   supplier:success,updateSupplier:success,status:success,presentations:success,
   createPresentation:success,presentationStatus:success}},
  {provide:PurchaseOrdersService,useValue:{create:success,edit:success,confirm:success,
   cancel:success,close:success,list:success,detail:success}},
  {provide:PurchaseReceiptsService,useValue:{create:success,edit:success,confirm:success,
   cancel:success,movements:success,list:success,detail:success}},
  {provide:PurchaseInvoicesService,useValue:{create:success,confirm:success,
   cancel:success,list:success,detail:success}},
  {provide:PurchasePaymentsService,useValue:{create:success,confirm:success,apply:success,
   reject:success,list:success,detail:success}},
  {provide:PurchaseReturnsService,useValue:{createReturn:success,confirmReturn:success,
   cancelReturn:success,returns:success,returnDetail:success,credits:success,creditDetail:success,
   createCredit:success,confirmCredit:success,cancelCredit:success,applyCredit:success,
   createSupplierRefund:success,confirmSupplierRefund:success,rejectSupplierRefund:success}}
 ];
 beforeEach(async()=>{
  vi.clearAllMocks();
  const module=await Test.createTestingModule({controllers:[
   SuppliersController,PresentationsController,PurchaseOrdersController,PurchaseReceiptsController,
   PurchaseInvoicesController,PurchasePaymentsController,PurchaseReturnsController,
   PurchaseCreditsController,PurchaseSupplierRefundsController],
   providers:mocks}).compile();
  app=module.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=user;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,
   forbidNonWhitelisted:true,transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>{if(app)await app.close();});
 it('validates supplier and presentation contract',async()=>{
  await request(app.getHttpServer()).post('/api/purchases/suppliers').send({nombre:'Proveedor ABC'}).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/presentations').send({
   articuloId:'a',nombre:'Saco de café',unidadCompraId:'u',factorAUnidadBase:'5000.000000'
  }).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/presentations').send({
   articuloId:'a',nombre:'Saco de café',unidadCompraId:'u',factorAUnidadBase:'-2'
  }).expect(400);
 });
 it('supports a confirmed order and rejects invalid tax values',async()=>{
  const order={proveedorId:'p',sucursalId:'s',precioIncluyeImpuesto:true,
   lineas:[{articuloId:'a',cantidadCompra:'2.000000',factorAUnidadBase:'1',
    precioUnitarioCompra:'11.20',tasaImpuesto:'0.12',impuestoRecuperable:true}]};
  await request(app.getHttpServer()).post('/api/purchases/orders').send(order).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/orders').send({...order,
   lineas:[{...order.lineas[0],tasaImpuesto:'1.5'}]}).expect(400);
  await request(app.getHttpServer()).post('/api/purchases/orders/o/confirm').send({
   claveOperacion:'PUR:ORDER:CONFIRM:1'}).expect(201);
 });
 it('validates receipt quantities and disallows unknown properties',async()=>{
  const receipt={proveedorId:'p',almacenId:'a',referenciaProveedor:'FAC-100',
   precioIncluyeImpuesto:true,lineas:[{articuloId:'a',ubicacionId:'l',
    cantidadCompra:'4',cantidadRechazada:'1',factorAUnidadBase:'1',
    precioUnitarioCompra:'10',tasaImpuesto:'0.12',impuestoRecuperable:true}]};
  await request(app.getHttpServer()).post('/api/purchases/receipts').send(receipt).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/receipts').send({...receipt,unexpected:true}).expect(400);
 });
 it('validates invoice and supplier payment applications',async()=>{
  await request(app.getHttpServer()).post('/api/purchases/invoices').send({
   proveedorId:'p',sucursalId:'s',numeroDocumento:'A-100',fechaEmision:'2026-10-16',
   precioIncluyeImpuesto:false,lineas:[{descripcion:'Café',cantidad:'1',precioUnitario:'100',
    tasaImpuesto:'0.12'}]}).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/payments').send({
   claveOperacion:'PUR:PAY:001',proveedorId:'p',sucursalId:'s',metodo:'TRANSFERENCIA',
   monto:'100.00',referencia:'BANCO-001',aplicaciones:[{facturaId:'f',monto:'100.00'}]
  }).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/payments').send({
   claveOperacion:'PUR:PAY:002',proveedorId:'p',sucursalId:'s',metodo:'TRANSFERENCIA',
   monto:'100.000',referencia:'BANCO-002',aplicaciones:[]
  }).expect(400);
 });
 it('routes returns, supplier credits and confirmation',async()=>{
  await request(app.getHttpServer()).post('/api/purchases/returns').send({
   proveedorId:'p',almacenId:'a',motivo:'Mercancía dañada',
   lineas:[{recepcionLineaId:'r',cantidadBase:'2.000000'}]}).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/credits').send({
   proveedorId:'p',sucursalId:'s',numeroDocumento:'NC-1',
   motivo:'Mercancía devuelta',total:'20.00'}).expect(201);
  await request(app.getHttpServer()).post('/api/purchases/credits/id/apply').send({
   claveOperacion:'PUR:NC:APPLY:1',facturaId:'f',monto:'20.00'}).expect(201);
  expect(success).toHaveBeenCalled();
 });
});
