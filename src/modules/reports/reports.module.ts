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
import {DomainReportsController} from './presentation/http/domain-reports.controller.js';
import {DomainReportsService} from './application/domain-reports.service.js';
import {DomainReportsPort} from './application/ports/domain-reports.port.js';
import {DomainReportsStore} from './infrastructure/prisma/domain-reports.store.js';
import {ReportExportController} from './presentation/http/report-export.controller.js';
import {ReportExportService} from './application/report-export.service.js';
@Module({
 imports:[PrismaModule],
 controllers:[ReportsController,ReportEvidenceController,DomainReportsController,ReportExportController],
 providers:[ReportingStore,ReportingService,{provide:ReportingPort,useExisting:ReportingStore},
  ReportEvidenceStore,ReportEvidenceService,{provide:ReportEvidencePort,useExisting:ReportEvidenceStore},
  DomainReportsStore,DomainReportsService,{provide:DomainReportsPort,useExisting:DomainReportsStore},
  ReportExportService],
 exports:[ReportingService,ReportingPort,ReportEvidenceService,ReportEvidencePort,DomainReportsService,DomainReportsPort]
})
export class ReportsModule{}
