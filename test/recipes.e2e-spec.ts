import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {INestApplication,ValidationPipe} from '@nestjs/common';
import request from 'supertest';
import type {App} from 'supertest/types';
import type {NextFunction,Request,Response} from 'express';
import type {Principal} from '../src/modules/auth/application/auth.service.js';
import {RecipeService} from '../src/modules/recipes/application/recipe.service.js';
import {RecipesController,ProductionController} from '../src/modules/recipes/presentation/http/recipes.controller.js';
const actor:Principal={id:'u1',email:'admin@example.test',nombre:'Admin',
 sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
describe('REC-A HTTP contracts',()=>{
 let app:INestApplication<App>;
 const service={
  list:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  options:vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}}),
  create:vi.fn().mockResolvedValue({id:'r1'}),detail:vi.fn().mockResolvedValue({id:'r1'}),
  update:vi.fn().mockResolvedValue({id:'r1'}),newVersion:vi.fn().mockResolvedValue({id:'v1'}),
  revise:vi.fn().mockResolvedValue({id:'v1'}),publish:vi.fn().mockResolvedValue({id:'v1'}),
  preview:vi.fn().mockResolvedValue({disponible:true,consumos:[]}),
  modifier:vi.fn().mockResolvedValue({id:'m1'}),setModifier:vi.fn().mockResolvedValue({id:'m1'}),
  packaging:vi.fn().mockResolvedValue([]),createPackaging:vi.fn().mockResolvedValue({id:'e1'}),
  coverage:vi.fn().mockResolvedValue({total:0}),productions:vi.fn().mockResolvedValue({data:[]}),
  production:vi.fn().mockResolvedValue({id:'p1'}),execute:vi.fn().mockResolvedValue({id:'p1',estado:'CONFIRMADA'}),
  draft:vi.fn().mockResolvedValue({id:'p1',estado:'BORRADOR'}),
  confirm:vi.fn().mockResolvedValue({id:'p1',estado:'CONFIRMADA'}),
  cancel:vi.fn().mockResolvedValue({id:'p1',estado:'CANCELADA'}),
  productionReport:vi.fn().mockResolvedValue({produccionesConfirmadas:1})
 };
 beforeEach(async()=>{
  vi.clearAllMocks();
  const mod=await Test.createTestingModule({controllers:[RecipesController,ProductionController],
   providers:[{provide:RecipeService,useValue:service}]}).compile();
  app=mod.createNestApplication<App>();app.setGlobalPrefix('api');
  app.use((req:Request&{auth?:Principal},_res:Response,next:NextFunction)=>{req.auth=actor;next();});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,
   transformOptions:{enableImplicitConversion:false}}));
  await app.init();
 });
 afterEach(async()=>app.close());
 const component={articuloId:'milk',unidadId:'ml',cantidad:'150.000000',mermaPorcentaje:'0'};
 const version={rendimiento:'1.000000',unidadRendimientoId:'un',
  componentes:[component],publicar:true};
 it('allows one-click recipe and version publication',async()=>{
  await request(app.getHttpServer()).post('/api/recipes').send({
   nombre:'Capuchino',tipo:'VENTA',varianteId:'v1',version
  }).expect(201);
  expect(service.create).toHaveBeenCalledWith(actor,expect.objectContaining({nombre:'Capuchino'}));
  await request(app.getHttpServer()).post('/api/recipes').send({
   nombre:'Capuchino',tipo:'VENTA',varianteId:'v1',version:{
    ...version,componentes:[{...component,cantidad:'-3'}]}
  }).expect(400);
  await request(app.getHttpServer()).post('/api/recipes').send({
   nombre:'Capuchino',tipo:'VENTA',varianteId:'v1',version:{
    ...version,componentes:[]}
  }).expect(400);
 });
 it('supports quick production and draft approval without a mandatory step',async()=>{
  const input={recetaVersionId:'v1',ubicacionDestinoId:'l1',
   cantidadProducida:'1000.000000',claveOperacion:'PROD:REQ:001'};
  await request(app.getHttpServer()).post('/api/production/batches/execute')
   .send(input).expect(201).expect({id:'p1',estado:'CONFIRMADA'});
  expect(service.execute).toHaveBeenCalledWith(actor,expect.objectContaining(input));
  await request(app.getHttpServer()).post('/api/production/batches')
   .send(input).expect(201);
  await request(app.getHttpServer()).post('/api/production/batches/p1/confirm')
   .expect(201);
  await request(app.getHttpServer()).post('/api/production/batches/execute')
   .send({...input,cantidadProducida:'0'}).expect(400);
 });
 it('validates modifier replacement and previews',async()=>{
  await request(app.getHttpServer()).put('/api/recipes/modifiers/m1/components').send({
   componentes:[{...component,efecto:'SUSTITUIR',sustituyeArticuloId:'alternative'}]
  }).expect(200);
  await request(app.getHttpServer()).put('/api/recipes/modifiers/m1/components').send({
   componentes:[{...component,efecto:'INVALID'}]
  }).expect(400);
  await request(app.getHttpServer()).get('/api/recipes/versions/v1/preview?sucursalId=b1')
   .expect(200);
  await request(app.getHttpServer()).get('/api/recipes/versions/v1/preview').expect(400);
 });
});
