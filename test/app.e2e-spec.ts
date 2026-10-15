import {Test} from '@nestjs/testing';
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {CoreModule} from '../src/modules/core/core.module.js';
import type {App} from 'supertest/types';
describe('Health public endpoint',()=>{
 let app:INestApplication<App>;
 beforeEach(async()=>{
  const module=await Test.createTestingModule({imports:[CoreModule]}).compile();
  app=module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
 });
 it('GET /api/health',()=>request(app.getHttpServer()).get('/api/health')
  .expect(200).expect({status:'ok',service:'gastro-core'}));
 afterEach(async()=>app.close());
});
