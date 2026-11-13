import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {AuthModule} from '../auth/auth.module.js';
import {OrdersModule} from '../orders/orders.module.js';
import {CatalogModule} from '../catalog/catalog.module.js';
import {RealtimeModule} from '../realtime/realtime.module.js';
import {SelfServiceStore} from './infrastructure/prisma/self-service.store.js';
import {SelfServicePort} from './application/ports/self-service.repository.js';
import {SelfServiceService} from './application/self-service.service.js';
import {SelfServiceController,SelfServiceTablesController} from './presentation/http/self-service.controller.js';
import {SelfServiceSessionGuard} from './presentation/http/guards/self-service-session.guard.js';

@Module({
 imports:[PrismaModule,AuthModule,OrdersModule,CatalogModule,RealtimeModule],
 controllers:[SelfServiceController,SelfServiceTablesController],
 providers:[SelfServiceStore,{provide:SelfServicePort,useExisting:SelfServiceStore},
  SelfServiceService,SelfServiceSessionGuard],
 exports:[SelfServiceService,SelfServicePort],
})
export class SelfServiceModule{}
