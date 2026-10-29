import {Module} from '@nestjs/common';
import {FinanceBankRepositoryPort} from './application/ports/finance-bank.repository.port.js';
import {FinanceBankService} from './application/finance-bank.service.js';
import {FinanceBankStore} from './infrastructure/prisma/finance-bank.store.js';
import {FinanceBankController,FinanceReverseController} from './presentation/http/finance-bank.controller.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {FinanceService} from './application/finance.service.js';
import {FinanceClosingService} from './application/finance-closing.service.js';
import {FinanceClosingRepositoryPort} from './application/ports/finance-closing.repository.port.js';
import {FinanceClosingStore} from './infrastructure/prisma/finance-closing.store.js';
import {FinanceClosingController} from './presentation/http/finance-closing.controller.js';
import {FinanceRepositoryPort} from './application/ports/finance.repository.port.js';
import {FinanceStore} from './infrastructure/prisma/finance.store.js';
import {FinanceAccountsController,FinanceExpensesController,FinanceIntentsController,
 FinanceReconciliationController,FinanceRoutingController} from './presentation/http/finance.controller.js';
@Module({
 imports:[PrismaModule,PaymentsModule],
 controllers:[FinanceIntentsController,FinanceAccountsController,FinanceExpensesController,
  FinanceReconciliationController,FinanceRoutingController,FinanceClosingController,
  FinanceBankController,FinanceReverseController],
 providers:[FinanceService,FinanceStore,{provide:FinanceRepositoryPort,useExisting:FinanceStore},
  FinanceBankService,FinanceBankStore,{provide:FinanceBankRepositoryPort,useExisting:FinanceBankStore},
  FinanceClosingService,FinanceClosingStore,
  {provide:FinanceClosingRepositoryPort,useExisting:FinanceClosingStore}],
 exports:[FinanceService,FinanceRepositoryPort,FinanceClosingService,FinanceBankService],
})
export class FinanceModule{}
