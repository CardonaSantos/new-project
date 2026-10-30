import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {CustomersService} from './application/customers.service.js';
import {CustomersPort,CustomerSelectionPort} from './application/ports/customers.port.js';
import {CustomersStore} from './infrastructure/prisma/customers.store.js';
import {CustomersController} from './presentation/http/customers.controller.js';

@Module({
 imports:[PrismaModule],
 controllers:[CustomersController],
 providers:[CustomersStore,CustomersService,{provide:CustomersPort,useExisting:CustomersStore},
  {provide:CustomerSelectionPort,useExisting:CustomersStore}],
 exports:[CustomersService,CustomersPort,CustomerSelectionPort]
})
export class CustomersModule{}
