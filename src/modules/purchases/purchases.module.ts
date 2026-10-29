
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
import {PurchaseMastersPort} from './application/ports/purchase-masters.port.js';
import {PurchaseMastersService} from './application/purchase-masters.service.js';
import {PurchaseOrdersPort} from './application/ports/purchase-orders.port.js';
import {PurchaseOrdersService} from './application/purchase-orders.service.js';
import {PurchaseReceiptsPort} from './application/ports/purchase-receipts.port.js';
import {PurchaseReceiptsService} from './application/purchase-receipts.service.js';
import {PurchaseInvoicesPort} from './application/ports/purchase-invoices.port.js';
import {PurchaseInvoicesService} from './application/purchase-invoices.service.js';
import {PurchasePaymentsPort} from './application/ports/purchase-payments.port.js';
import {PurchasePaymentsService} from './application/purchase-payments.service.js';
import {PurchaseReturnsPort} from './application/ports/purchase-returns.port.js';
import {PurchaseReturnsService} from './application/purchase-returns.service.js';
@Module({
 imports:[PrismaModule,InventoryModule,PaymentsModule],
 controllers:[SuppliersController,PresentationsController,PurchaseOrdersController,
  PurchaseReceiptsController,PurchaseInvoicesController,PurchasePaymentsController,
  PurchaseReturnsController,PurchaseCreditsController,PurchaseSupplierRefundsController],
 providers:[PurchaseMastersStore,PurchaseOrdersStore,PurchaseReceiptsStore,
  PurchaseInvoicesStore,PurchasePaymentsStore,PurchaseReturnsStore,
  PurchaseMastersService,
  {provide:PurchaseMastersPort,useExisting:PurchaseMastersStore},
  PurchaseOrdersService,
  {provide:PurchaseOrdersPort,useExisting:PurchaseOrdersStore},
  PurchaseReceiptsService,
  {provide:PurchaseReceiptsPort,useExisting:PurchaseReceiptsStore},
  PurchaseInvoicesService,
  {provide:PurchaseInvoicesPort,useExisting:PurchaseInvoicesStore},
  PurchasePaymentsService,
  {provide:PurchasePaymentsPort,useExisting:PurchasePaymentsStore},
  PurchaseReturnsService,
  {provide:PurchaseReturnsPort,useExisting:PurchaseReturnsStore}],
 exports:[PurchaseOrdersStore,...[PurchaseMastersService,PurchaseMastersPort,PurchaseOrdersService,PurchaseOrdersPort,PurchaseReceiptsService,PurchaseReceiptsPort,PurchaseInvoicesService,PurchaseInvoicesPort,PurchasePaymentsService,PurchasePaymentsPort,PurchaseReturnsService,PurchaseReturnsPort]]
})
export class PurchasesModule{}
