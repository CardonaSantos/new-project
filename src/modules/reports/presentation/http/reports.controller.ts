import {Controller,Get,Header,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ReportingService} from '../../application/reporting.service.js';
import {BranchReportDto,ReportPeriodDto,TicketsReportDto} from './dto/reports.dto.js';
@Controller('reports')
export class ReportsController{
 constructor(private readonly reports:ReportingService){}
 @Get('operational/dashboard') @Header('Cache-Control','no-store')
 operational(@CurrentUser() u:Principal,@Query() q:BranchReportDto){
  return this.reports.operational(u,q);
 }
 @Get('analytics/overview') @Header('Cache-Control','no-store')
 overview(@CurrentUser() u:Principal,@Query() q:ReportPeriodDto){
  return this.reports.overview(u,q);
 }
 @Get('analytics/payments-by-method') @Header('Cache-Control','no-store')
 paymentsByMethod(@CurrentUser() u:Principal,@Query() q:ReportPeriodDto){
  return this.reports.paymentsByMethod(u,q);
 }
 @Get('analytics/expenses-by-category') @Header('Cache-Control','no-store')
 expensesByCategory(@CurrentUser() u:Principal,@Query() q:ReportPeriodDto){
  return this.reports.expensesByCategory(u,q);
 }
 @Get('analytics/cash-shifts') @Header('Cache-Control','no-store')
 cashShifts(@CurrentUser() u:Principal,@Query() q:TicketsReportDto){
  return this.reports.cashShifts(u,q);
 }
 @Get('analytics/tickets') @Header('Cache-Control','no-store')
 tickets(@CurrentUser() u:Principal,@Query() q:TicketsReportDto){
  return this.reports.tickets(u,q);
 }
}
