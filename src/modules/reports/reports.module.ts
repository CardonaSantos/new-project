import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {ReportingService} from './application/reporting.service.js';
import {ReportingPort} from './application/ports/reporting.port.js';
import {ReportingStore} from './infrastructure/prisma/reporting.store.js';
import {ReportsController} from './presentation/http/reports.controller.js';
@Module({
 imports:[PrismaModule],
 controllers:[ReportsController],
 providers:[ReportingStore,ReportingService,{provide:ReportingPort,useExisting:ReportingStore}],
 exports:[ReportingService,ReportingPort]
})
export class ReportsModule{}
