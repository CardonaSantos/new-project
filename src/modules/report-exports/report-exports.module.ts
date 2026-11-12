import {Module} from '@nestjs/common';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {DomainReportsController} from './presentation/http/domain-reports.controller.js';
import {DomainReportsService} from './application/domain-reports.service.js';
import {DomainReportsPort} from './application/ports/domain-reports.port.js';
import {DomainReportsStore} from './infrastructure/prisma/domain-reports.store.js';
import {ReportExportController} from './presentation/http/report-export.controller.js';
import {ReportExportService} from './application/report-export.service.js';
import {DailyReportController} from './presentation/http/daily-report.controller.js';
import {DailyReportService} from './application/daily-report.service.js';
import {DailyReportPort} from './application/ports/daily-report.port.js';
import {DailyReportStore} from './infrastructure/prisma/daily-report.store.js';
import {DailyReportExportService} from './application/daily-report-export.service.js';
import {SalesReportController} from './presentation/http/sales-report.controller.js';
import {SalesReportService} from './application/sales-report.service.js';
import {SalesReportPort} from './application/ports/sales-report.port.js';
import {SalesReportStore} from './infrastructure/prisma/sales-report.store.js';
import {SalesReportExportService} from './application/sales-report-export.service.js';
import {CustomerReportController} from './presentation/http/customer-report.controller.js';
import {CustomerReportService} from './application/customer-report.service.js';
import {CustomerReportPort} from './application/ports/customer-report.port.js';
import {CustomerReportStore} from './infrastructure/prisma/customer-report.store.js';
import {CustomerReportExportService} from './application/customer-report-export.service.js';
import {InventoryReportController} from './presentation/http/inventory-report.controller.js';
import {InventoryReportService} from './application/inventory-report.service.js';
import {InventoryReportPort} from './application/ports/inventory-report.port.js';
import {InventoryReportStore} from './infrastructure/prisma/inventory-report.store.js';
import {InventoryReportExportService} from './application/inventory-report-export.service.js';
import {CashSessionReportController} from './presentation/http/cash-session-report.controller.js';
import {CashSessionReportService} from './application/cash-session-report.service.js';
import {CashSessionReportPort} from './application/ports/cash-session-report.port.js';
import {CashSessionReportStore} from './infrastructure/prisma/cash-session-report.store.js';
import {CashSessionReportExportService} from './application/cash-session-report-export.service.js';

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
 controllers:[DomainReportsController,ReportExportController,DailyReportController,
  SalesReportController,CustomerReportController,InventoryReportController,
  CashSessionReportController],
 providers:[DomainReportsStore,DomainReportsService,
  {provide:DomainReportsPort,useExisting:DomainReportsStore},
  ReportExportService,
  DailyReportStore,DailyReportService,
  {provide:DailyReportPort,useExisting:DailyReportStore},
  DailyReportExportService,
  SalesReportStore,SalesReportService,
  {provide:SalesReportPort,useExisting:SalesReportStore},
  SalesReportExportService,
  CustomerReportStore,CustomerReportService,
  {provide:CustomerReportPort,useExisting:CustomerReportStore},
  CustomerReportExportService,
  InventoryReportStore,InventoryReportService,
  {provide:InventoryReportPort,useExisting:InventoryReportStore},
  InventoryReportExportService,
  CashSessionReportStore,CashSessionReportService,
  {provide:CashSessionReportPort,useExisting:CashSessionReportStore},
  CashSessionReportExportService],
 exports:[DomainReportsService,DomainReportsPort,DailyReportService,DailyReportPort,
  SalesReportService,SalesReportPort,CustomerReportService,CustomerReportPort,
  InventoryReportService,InventoryReportPort,
  CashSessionReportService,CashSessionReportPort]
})
export class ReportExportsModule{}
