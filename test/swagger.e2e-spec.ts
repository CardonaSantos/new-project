import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Body, Controller, Get, INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { buildOpenApiDocument, setupSwagger, swaggerEnabled } from '../src/config/swagger.js';

class LoginExample {
  @ApiProperty({ example: 'admin@example.com' })
  @IsString()
  email!: string;

  @ApiProperty({ example: 'Password123456' })
  @IsString()
  password!: string;
}
@Controller('auth')
class AuthExampleController {
  @Post('login')
  login(@Body() _dto: LoginExample) { return { accessToken: 'fixture' }; }

  @Post('refresh')
  refresh() { return { accessToken: 'fixture' }; }
}
@Controller('health')
class HealthExampleController {
  @Get() health() { return { status: 'ok' }; }
}
@Controller('inventory/articles')
class ArticlesExampleController {
  @Get() getArticles() { return { data: [] }; }
}
@Module({ controllers: [AuthExampleController, HealthExampleController, ArticlesExampleController] })
class SwaggerTestModule {}

describe('OpenAPI HTTP documentation', () => {
  let app: INestApplication<App>;
  beforeEach(async () => {
    const mod = await Test.createTestingModule({ imports: [SwaggerTestModule] }).compile();
    app = mod.createNestApplication<App>();
    app.setGlobalPrefix('api');
    setupSwagger(app);
    await app.init();
  });
  afterEach(async () => app.close());

  it('serves JSON including API-prefixed paths, tags and bearer policy', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs/openapi.json').expect(200);
    const doc = res.body as Record<string, any>;
    expect(doc.info.title).toBe('Gastro Core API');
    expect(doc.components.securitySchemes['access-token'].scheme).toBe('bearer');
    expect(doc.security).toEqual([{ 'access-token': [] }]);
    expect(doc.paths['/api/auth/login'].post.security).toEqual([]);
    expect(doc.paths['/api/auth/refresh'].post.security).toEqual([]);
    expect(doc.paths['/api/health'].get.security).toEqual([]);
    expect(doc.paths['/api/inventory/articles'].get.tags).toEqual(['Inventario · Artículos']);
    expect(doc.paths['/api/inventory/articles'].get.parameters)
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'x-sucursal-id' })]));
  });

  it('documents JSON DTO fields, without changing the real handlers', async () => {
    const doc = buildOpenApiDocument(app);
    const req = doc.paths['/api/auth/login']?.post.requestBody as any;
    expect(req.content['application/json'].schema).toBeDefined();
    const schemas = Object.values(doc.components.schemas) as Array<Record<string, any>>;
    expect(schemas.some(x => x.properties?.email && x.properties?.password)).toBe(true);
  });

  it('serves the UI on a distinct route', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('keeps production documentation disabled by default', () => {
    expect(swaggerEnabled('production')).toBe(false);
  });
});
