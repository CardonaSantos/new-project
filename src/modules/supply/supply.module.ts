import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {PurchasesModule} from '../purchases/purchases.module.js';
import {SupplyStore} from './supply.store.js';
import {SupplyRequisitionsController,SupplyTransfersController} from './supply.controller.js';
@Module({
 imports:[PrismaModule,AuthModule,InventoryModule,PurchasesModule],
 controllers:[SupplyRequisitionsController,SupplyTransfersController],
 providers:[SupplyStore],
})
export class SupplyModule{}
