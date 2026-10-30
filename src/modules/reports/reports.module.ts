import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {ReportingService} from './application/reporting.service.js';
import {ReportingPort} from './application/ports/reporting.port.js';
import {ReportingStore} from './infrastructure/prisma/reporting.store.js';
import {ReportsController} from './presentation/http/reports.controller.js';
import {ReportEvidenceController} from './presentation/http/report-evidence.controller.js';
import {ReportEvidenceService} from './application/report-evidence.service.js';
import {ReportEvidencePort} from './application/ports/report-evidence.port.js';
import {ReportEvidenceStore} from './infrastructure/prisma/report-evidence.store.js';
@Module({
 imports:[PrismaModule],
 controllers:[ReportsController,ReportEvidenceController],
 providers:[ReportingStore,ReportingService,{provide:ReportingPort,useExisting:ReportingStore},
  ReportEvidenceStore,ReportEvidenceService,{provide:ReportEvidencePort,useExisting:ReportEvidenceStore}],
 exports:[ReportingService,ReportingPort,ReportEvidenceService,ReportEvidencePort]
})
export class ReportsModule{}
