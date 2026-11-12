import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {DomainReportsController} from './presentation/http/domain-reports.controller.js';
import {DomainReportsService} from './application/domain-reports.service.js';
import {DomainReportsPort} from './application/ports/domain-reports.port.js';
import {DomainReportsStore} from './infrastructure/prisma/domain-reports.store.js';
import {ReportExportController} from './presentation/http/report-export.controller.js';
import {ReportExportService} from './application/report-export.service.js';

/**
 * Printable/exportable reports: the 15 raw record sources browsable in-app
 * (reports/analytics/sources/*) and their CSV/XLSX/PDF downloads
 * (reports/analytics/exports/*).
 *
 * Deliberately independent from ../reports (the live operational dashboard + the
 * in-app analytics KPI tabs): no imports between the two modules, no shared service.
 * The only overlap is the HTTP path prefix (both controllers sit under /reports/...,
 * same as before this split — routes are unchanged, only where the code lives moved),
 * and a couple of small, intentionally duplicated files (report-period.policy.ts,
 * the ReportingQuery/TicketQuery contracts) rather than a shared import, so this
 * module can be rebuilt, redeployed or reasoned about without touching the dashboard.
 */
@Module({
 imports:[PrismaModule],
 controllers:[DomainReportsController,ReportExportController],
 providers:[DomainReportsStore,DomainReportsService,
  {provide:DomainReportsPort,useExisting:DomainReportsStore},
  ReportExportService],
 exports:[DomainReportsService,DomainReportsPort]
})
export class ReportExportsModule{}
