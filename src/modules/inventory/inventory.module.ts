import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {MediaModule} from '../media/media.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryService} from './application/inventory.service.js';
import {InventoryMediaService} from './application/inventory-media.service.js';
import {InventoryRepositoryPort} from './application/ports/inventory.repository.port.js';
import {PrismaInventoryRepository} from './infrastructure/prisma/prisma-inventory.repository.js';
import {InventoryUnitsController,InventoryConversionsController} from './presentation/http/inventory-units.controller.js';
import {InventoryArticlesController} from './presentation/http/inventory-articles.controller.js';
import {InventoryWarehousesController,InventoryLocationsController} from './presentation/http/inventory-storage.controller.js';
import {InventoryReportsController} from './presentation/http/inventory-reports.controller.js';
import {InventoryPostingEngine} from './infrastructure/prisma/inventory-posting.engine.js';
import {InventoryDocumentsStore} from './infrastructure/prisma/inventory-documents.store.js';
import {InventoryOperationsStore} from './infrastructure/prisma/inventory-operations.store.js';
import {InventoryStockController,InventoryLotsController,InventoryMovementsController,InventoryManualController,
 InventoryCountsController,InventoryTransfersController,InventoryOperationalReportsController
} from './presentation/http/inventory-operations.controller.js';
@Module({
 imports:[PrismaModule,AuthModule,MediaModule],
 controllers:[InventoryUnitsController,InventoryConversionsController,InventoryArticlesController,
  InventoryWarehousesController,InventoryLocationsController,InventoryReportsController,
 InventoryStockController,InventoryLotsController,InventoryMovementsController,InventoryManualController,
 InventoryCountsController,InventoryTransfersController,InventoryOperationalReportsController],
 providers:[InventoryService,InventoryMediaService,InventoryPostingEngine,InventoryDocumentsStore,InventoryOperationsStore,
  {provide:InventoryRepositoryPort,useClass:PrismaInventoryRepository}],
 exports:[InventoryService,InventoryRepositoryPort,InventoryPostingEngine]
})
export class InventoryModule{}
