import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {FinanceAccountsController,FinanceExpensesController,FinanceIntentsController,FinanceReconciliationController} from './finance.controller.js';
import {FinanceStore} from './finance.store.js';

@Module({
 imports:[PrismaModule,PaymentsModule],
 controllers:[FinanceIntentsController,FinanceAccountsController,FinanceExpensesController,FinanceReconciliationController],
 providers:[FinanceStore],
})
export class FinanceModule{}
