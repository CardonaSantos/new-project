import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {FinanceModule} from '../finance/finance.module.js';
import {DeliverySettlementsPort} from './application/ports/delivery-settlements.port.js';
import {DeliverySettlementsService} from './application/delivery-settlements.service.js';
import {DeliverySettlementsStore} from './infrastructure/prisma/delivery-settlements.store.js';
import {SettlementCommon} from './infrastructure/prisma/settlement-common.js';
import {CourierSettlementsStore} from './infrastructure/prisma/courier-settlements.store.js';
import {PlatformSettlementsStore} from './infrastructure/prisma/platform-settlements.store.js';
import {DeliverySettlementsController} from './presentation/http/delivery-settlements.controller.js';
import {DeliveryService} from './application/delivery.service.js';
import {DeliveryPort} from './application/ports/delivery.port.js';
import {DeliveryStore} from './infrastructure/prisma/delivery.store.js';
import {DeliveryController} from './presentation/http/delivery.controller.js';

@Module({
 imports:[PrismaModule,PaymentsModule,FinanceModule],
 controllers:[DeliveryController,DeliverySettlementsController],
 providers:[DeliveryStore,DeliveryService,{provide:DeliveryPort,useExisting:DeliveryStore},
  SettlementCommon,CourierSettlementsStore,PlatformSettlementsStore,
  DeliverySettlementsStore,DeliverySettlementsService,
  {provide:DeliverySettlementsPort,useExisting:DeliverySettlementsStore}],
 exports:[DeliveryService,DeliveryPort,DeliverySettlementsService]
})
export class DeliveryModule{}
