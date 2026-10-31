import {Controller,Get,Header,Param,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ReportEvidenceService} from '../../application/report-evidence.service.js';
import {CashEvidenceDto,TicketsReportDto} from './dto/reports.dto.js';
@Controller('reports/analytics')
export class ReportEvidenceController{
 constructor(private readonly evidence:ReportEvidenceService){}
 @Get('cash-shifts/:id/evidence') @Header('Cache-Control','no-store')
 cashShift(@CurrentUser() u:Principal,@Param('id') id:string,@Query() q:CashEvidenceDto){
  return this.evidence.cashShift(u,id,q);
 }
 @Get('payments/records') @Header('Cache-Control','no-store')
 payments(@CurrentUser() u:Principal,@Query() q:TicketsReportDto){
  return this.evidence.payments(u,q);
 }
 @Get('expenses/records') @Header('Cache-Control','no-store')
 expenses(@CurrentUser() u:Principal,@Query() q:TicketsReportDto){
  return this.evidence.expenses(u,q);
 }
}
