import {Controller,Get,Header,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CashSessionReportService} from '../../application/cash-session-report.service.js';
import {CashSessionReportExportService} from '../../application/cash-session-report-export.service.js';
import {CashSessionReportDto,CashSessionReportExportDto} from './dto/cash-session-report.dto.js';

@Controller('reports/cash-sessions')
export class CashSessionReportController{
 constructor(private readonly reports:CashSessionReportService,
  private readonly exports:CashSessionReportExportService){}
 @Get() @Header('Cache-Control','no-store')
 snapshot(@CurrentUser() u:Principal,@Query() q:CashSessionReportDto){
  return this.reports.snapshot(u,{sucursalId:q.sucursalId,periodo:q.periodo,
   fecha:q.fecha,desde:q.desde,hasta:q.hasta});
 }
 @Get('export') @Header('Cache-Control','private, no-store, max-age=0')
 async download(@CurrentUser() u:Principal,@Query() q:CashSessionReportExportDto,@Res() res:Response){
  const file=await this.exports.download(u,q);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+file.filename+'"');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Report-SHA256',file.sha256);
  res.setHeader('Content-Length',file.buffer.length);
  return res.status(200).send(file.buffer);
 }
}
