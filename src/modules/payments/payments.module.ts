
import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {CashStore} from './infrastructure/prisma/cash.store.js';
import {PaymentsStore} from './infrastructure/prisma/payments.store.js';
import {CashController,AccountsController,AttemptsController,PaymentsController,SalesController} from './presentation/http/payments.controller.js';
@Module({
 imports:[PrismaModule,AuthModule],
 controllers:[CashController,AccountsController,AttemptsController,PaymentsController,SalesController],
 providers:[CashStore,PaymentsStore],
 exports:[PaymentsStore]
})
export class PaymentsModule{}
