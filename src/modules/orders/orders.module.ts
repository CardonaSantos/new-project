import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {OrdersService} from './application/orders.service.js';
import {OrderStore} from './infrastructure/order.store.js';
import {OrdersController,KitchenController,TablesController} from './presentation/orders.controller.js';
@Module({imports:[PrismaModule,InventoryModule],
 controllers:[OrdersController,KitchenController,TablesController],
 providers:[OrdersService,OrderStore],exports:[OrdersService]})
export class OrdersModule{}
