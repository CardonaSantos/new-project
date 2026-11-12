import {Controller,Get,Header,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CustomerReportService} from '../../application/customer-report.service.js';
import {CustomerReportExportService} from '../../application/customer-report-export.service.js';
import {CustomerReportDto,CustomerReportExportDto} from './dto/customer-report.dto.js';

@Controller('reports/customers')
export class CustomerReportController{
 constructor(private readonly reports:CustomerReportService,
  private readonly exports:CustomerReportExportService){}
 @Get() @Header('Cache-Control','no-store')
 snapshot(@CurrentUser() u:Principal,@Query() q:CustomerReportDto){
  return this.reports.snapshot(u,{sucursalId:q.sucursalId,soloActivos:q.soloActivos,limite:q.limite});
 }
 @Get('export') @Header('Cache-Control','private, no-store, max-age=0')
 async download(@CurrentUser() u:Principal,@Query() q:CustomerReportExportDto,@Res() res:Response){
  const file=await this.exports.download(u,q);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+file.filename+'"');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Report-SHA256',file.sha256);
  res.setHeader('Content-Length',file.buffer.length);
  return res.status(200).send(file.buffer);
 }
}
