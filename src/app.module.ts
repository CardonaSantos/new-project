import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {validateEnvironment} from './config/env.validation.js';
import {CoreModule} from './modules/core/core.module.js';
import {AuthModule} from './modules/auth/auth.module.js';
import {MediaModule} from './modules/media/media.module.js';
import {UsersModule} from './modules/users/users.module.js';
import {OrganizationModule} from './modules/organization/organization.module.js';
import {InventoryModule} from './modules/inventory/inventory.module.js';
import {CatalogModule} from './modules/catalog/catalog.module.js';
@Module({
 imports:[
  ConfigModule.forRoot({isGlobal:true,cache:true,validate:validateEnvironment}),
  AuthModule,
  MediaModule,
  UsersModule,
  OrganizationModule,
  InventoryModule,
  CatalogModule,
  CoreModule,
 ],
})
export class AppModule {}
