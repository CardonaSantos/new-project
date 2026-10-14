import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation.js';
import { CoreModule } from './modules/core/core.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    CoreModule,
    // Future bounded contexts import PrismaModule in their adapters.
    // Example: AuthModule, CatalogModule, OrdersModule, InventoryModule.
  ],
})
export class AppModule {}
