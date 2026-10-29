import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {FinanceService} from './application/finance.service.js';
import {FinanceRepositoryPort} from './application/ports/finance.repository.port.js';
import {FinanceStore} from './infrastructure/prisma/finance.store.js';
import {FinanceAccountsController,FinanceExpensesController,FinanceIntentsController,
 FinanceReconciliationController,FinanceRoutingController} from './presentation/http/finance.controller.js';
@Module({
 imports:[PrismaModule,PaymentsModule],
 controllers:[FinanceIntentsController,FinanceAccountsController,FinanceExpensesController,
  FinanceReconciliationController,FinanceRoutingController],
 providers:[FinanceService,FinanceStore,{provide:FinanceRepositoryPort,useExisting:FinanceStore}],
 exports:[FinanceService,FinanceRepositoryPort],
})
export class FinanceModule{}
