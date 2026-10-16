import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {RecipesModule} from '../recipes/recipes.module.js';
import {OrderStore} from './infrastructure/prisma/order.store.js';
import {KitchenStore} from './infrastructure/prisma/kitchen.store.js';
import {ConsumptionStore} from './infrastructure/prisma/consumption.store.js';
import {TableStore} from './infrastructure/prisma/table.store.js';
import {OrdersController,KitchenController,TablesController} from './presentation/http/orders.controller.js';
@Module({
 imports:[PrismaModule,AuthModule,InventoryModule,RecipesModule],
 controllers:[OrdersController,KitchenController,TablesController],
 providers:[OrderStore,KitchenStore,TableStore,ConsumptionStore],
 exports:[OrderStore,KitchenStore]
})
export class OrdersModule{}
