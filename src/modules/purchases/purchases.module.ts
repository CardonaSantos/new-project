
import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {PurchaseMastersStore} from './infrastructure/prisma/purchase-masters.store.js';
import {PurchaseOrdersStore} from './infrastructure/prisma/purchase-orders.store.js';
import {PurchaseReceiptsStore} from './infrastructure/prisma/purchase-receipts.store.js';
import {PurchaseInvoicesStore} from './infrastructure/prisma/purchase-invoices.store.js';
import {PurchasePaymentsStore} from './infrastructure/prisma/purchase-payments.store.js';
import {PurchaseReturnsStore} from './infrastructure/prisma/purchase-returns.store.js';
import {SuppliersController,PresentationsController,PurchaseOrdersController,
 PurchaseReceiptsController,PurchaseInvoicesController,PurchasePaymentsController,
 PurchaseReturnsController,PurchaseCreditsController,PurchaseSupplierRefundsController}
 from './presentation/http/purchases.controller.js';
@Module({
 imports:[PrismaModule,InventoryModule,PaymentsModule],
 controllers:[SuppliersController,PresentationsController,PurchaseOrdersController,
  PurchaseReceiptsController,PurchaseInvoicesController,PurchasePaymentsController,
  PurchaseReturnsController,PurchaseCreditsController,PurchaseSupplierRefundsController],
 providers:[PurchaseMastersStore,PurchaseOrdersStore,PurchaseReceiptsStore,
  PurchaseInvoicesStore,PurchasePaymentsStore,PurchaseReturnsStore],
 exports:[PurchaseOrdersStore]
})
export class PurchasesModule{}
