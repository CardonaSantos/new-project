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
import {RecipesModule} from './modules/recipes/recipes.module.js';
import {OrdersModule} from './modules/orders/orders.module.js';
import {PaymentsModule} from './modules/payments/payments.module.js';
import {PurchasesModule} from './modules/purchases/purchases.module.js';
import {SupplyModule} from './modules/supply/supply.module.js';
import {FinanceModule} from './modules/finance/finance.module.js';
@Module({
 imports:[
  ConfigModule.forRoot({isGlobal:true,cache:true,validate:validateEnvironment}),
  AuthModule,
  MediaModule,
  UsersModule,
  OrganizationModule,
  InventoryModule,
  CatalogModule,
  RecipesModule,
  OrdersModule,
  PaymentsModule,
  PurchasesModule,
  SupplyModule,
  FinanceModule,
  CoreModule,
 ],
})
export class AppModule {}
