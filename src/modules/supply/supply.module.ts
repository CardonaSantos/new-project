import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {PurchasesModule} from '../purchases/purchases.module.js';
import {SupplyService} from './application/supply.service.js';
import {SupplyRepositoryPort} from './application/ports/supply.repository.port.js';
import {SupplyStore} from './infrastructure/prisma/supply.store.js';
import {SupplyRequisitionsController,SupplyTransfersController} from './presentation/http/supply.controller.js';
@Module({
 imports:[PrismaModule,AuthModule,InventoryModule,PurchasesModule],
 controllers:[SupplyRequisitionsController,SupplyTransfersController],
 providers:[SupplyService,SupplyStore,{provide:SupplyRepositoryPort,useExisting:SupplyStore}],
 exports:[SupplyService,SupplyRepositoryPort],
})
export class SupplyModule{}
