import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {DeliveryService} from './application/delivery.service.js';
import {DeliveryPort} from './application/ports/delivery.port.js';
import {DeliveryStore} from './infrastructure/prisma/delivery.store.js';
import {DeliveryController} from './presentation/http/delivery.controller.js';

@Module({
 imports:[PrismaModule],
 controllers:[DeliveryController],
 providers:[DeliveryStore,DeliveryService,{provide:DeliveryPort,useExisting:DeliveryStore}],
 exports:[DeliveryService,DeliveryPort]
})
export class DeliveryModule{}
