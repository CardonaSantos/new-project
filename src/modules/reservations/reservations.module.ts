import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {ReservationsController} from './presentation/http/reservations.controller.js';
import {ReservationsService} from './application/reservations.service.js';
import {ReservationsPort} from './application/ports/reservations.port.js';
import {ReservationsStore} from './infrastructure/prisma/reservations.store.js';
@Module({
 imports:[PrismaModule],
 controllers:[ReservationsController],
 providers:[ReservationsStore,ReservationsService,{provide:ReservationsPort,useExisting:ReservationsStore}],
 exports:[ReservationsService,ReservationsPort]
})
export class ReservationsModule{}
