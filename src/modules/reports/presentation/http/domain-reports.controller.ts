import {Controller,Get,Header,Param,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DomainReportsService} from '../../application/domain-reports.service.js';
import {TicketsReportDto} from './dto/reports.dto.js';
@Controller('reports/analytics/sources')
export class DomainReportsController{
 constructor(private readonly reports:DomainReportsService){}
 @Get(':source') @Header('Cache-Control','no-store')
 records(@CurrentUser() u:Principal,@Param('source') source:string,@Query() q:TicketsReportDto){
  return this.reports.records(u,source,q);
 }
}
