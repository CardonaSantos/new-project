import {BadRequestException,Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import type {TicketQuery,ConsolidatedQuery} from './contracts/reporting.types.js';
import {REPORT_SOURCES,DomainReportsPort,type ReportSource} from './ports/domain-reports.port.js';
@Injectable()
export class DomainReportsService{
 constructor(private readonly source:DomainReportsPort){}
 consolidated(u:Principal,q:ConsolidatedQuery){
  return this.source.consolidated(u,q);
 }
 exportRecords(u:Principal,kind:string,q:TicketQuery){
  if(!REPORT_SOURCES.includes(kind as ReportSource))
   throw new BadRequestException('Fuente de reporte no admitida');
  return this.source.exportRecords(u,kind as ReportSource,q);
 }
 records(u:Principal,kind:string,q:TicketQuery){
  if(!REPORT_SOURCES.includes(kind as ReportSource))
   throw new BadRequestException('Fuente de reporte no admitida');
  return this.source.records(u,kind as ReportSource,q);
 }
}
