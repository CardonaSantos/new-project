
import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {CashStore} from './infrastructure/prisma/cash.store.js';
import {PaymentsStore} from './infrastructure/prisma/payments.store.js';
import {CashController,AccountsController,AttemptsController,PaymentsController,SalesController,PaymentReportsController} from './presentation/http/payments.controller.js';
import {CashPort} from './application/ports/cash.port.js';
import {CashService} from './application/cash.service.js';
import {PaymentsPort} from './application/ports/payments.port.js';
import {PaymentsService} from './application/payments.service.js';
@Module({
 imports:[PrismaModule,AuthModule],
 controllers:[CashController,AccountsController,AttemptsController,PaymentsController,SalesController,PaymentReportsController],
 providers:[CashStore,PaymentsStore,
  CashService,
  {provide:CashPort,useExisting:CashStore},
  PaymentsService,
  {provide:PaymentsPort,useExisting:PaymentsStore}],
 exports:[CashStore,PaymentsStore,CashService,CashPort,PaymentsService,PaymentsPort]
})
export class PaymentsModule{}
