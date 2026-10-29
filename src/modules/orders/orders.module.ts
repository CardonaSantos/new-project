import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {RecipesModule} from '../recipes/recipes.module.js';
import {OrderStore} from './infrastructure/prisma/order.store.js';
import {KitchenStore} from './infrastructure/prisma/kitchen.store.js';
import {ConsumptionStore} from './infrastructure/prisma/consumption.store.js';
import {TableStore} from './infrastructure/prisma/table.store.js';
import {OrdersController,KitchenController,TablesController} from './presentation/http/orders.controller.js';
import {OrderPort} from './application/ports/order.port.js';
import {OrderService} from './application/order.service.js';
import {KitchenPort} from './application/ports/kitchen.port.js';
import {KitchenService} from './application/kitchen.service.js';
import {TablePort} from './application/ports/table.port.js';
import {TableService} from './application/table.service.js';
@Module({
 imports:[PrismaModule,AuthModule,InventoryModule,RecipesModule,PaymentsModule],
 controllers:[OrdersController,KitchenController,TablesController],
 providers:[OrderStore,KitchenStore,TableStore,ConsumptionStore,
  OrderService,
  {provide:OrderPort,useExisting:OrderStore},
  KitchenService,
  {provide:KitchenPort,useExisting:KitchenStore},
  TableService,
  {provide:TablePort,useExisting:TableStore}],
 exports:[OrderStore,KitchenStore,OrderService,OrderPort,KitchenService,KitchenPort,TableService,TablePort]
})
export class OrdersModule{}
