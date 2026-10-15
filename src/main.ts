import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { setupSwagger, swaggerEnabled } from './config/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cfg = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  if (swaggerEnabled(
    cfg.get<string>('NODE_ENV'),
    cfg.get<string>('SWAGGER_ENABLED'),
  )) {
    setupSwagger(app);
  }
  const origins = (cfg.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });
  await app.listen(
    Number(cfg.get<string>('PORT') ?? 3000),
    cfg.get<string>('HOST') ?? '0.0.0.0',
  );
}
void bootstrap();
