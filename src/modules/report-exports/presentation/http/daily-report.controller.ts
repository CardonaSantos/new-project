import {Controller,Get,Header,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DailyReportService} from '../../application/daily-report.service.js';
import {DailyReportExportService} from '../../application/daily-report-export.service.js';
import {DailyReportDto,DailyReportExportDto} from './dto/daily-report.dto.js';

@Controller('reports/daily')
export class DailyReportController{
 constructor(private readonly reports:DailyReportService,
  private readonly exports:DailyReportExportService){}
 @Get() @Header('Cache-Control','no-store')
 snapshot(@CurrentUser() u:Principal,@Query() q:DailyReportDto){
  return this.reports.snapshot(u,{sucursalId:q.sucursalId,fecha:q.fecha});
 }
 @Get('export') @Header('Cache-Control','private, no-store, max-age=0')
 async download(@CurrentUser() u:Principal,@Query() q:DailyReportExportDto,@Res() res:Response){
  const file=await this.exports.download(u,q);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+file.filename+'"');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Report-SHA256',file.sha256);
  res.setHeader('Content-Length',file.buffer.length);
  return res.status(200).send(file.buffer);
 }
}
