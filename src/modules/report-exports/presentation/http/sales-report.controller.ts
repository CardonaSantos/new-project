import {Controller,Get,Header,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {SalesReportService} from '../../application/sales-report.service.js';
import {SalesReportExportService} from '../../application/sales-report-export.service.js';
import {SalesReportDto,SalesReportExportDto} from './dto/sales-report.dto.js';

@Controller('reports/sales')
export class SalesReportController{
 constructor(private readonly reports:SalesReportService,
  private readonly exports:SalesReportExportService){}
 @Get() @Header('Cache-Control','no-store')
 snapshot(@CurrentUser() u:Principal,@Query() q:SalesReportDto){
  return this.reports.snapshot(u,{sucursalId:q.sucursalId,periodo:q.periodo,
   fecha:q.fecha,desde:q.desde,hasta:q.hasta});
 }
 @Get('export') @Header('Cache-Control','private, no-store, max-age=0')
 async download(@CurrentUser() u:Principal,@Query() q:SalesReportExportDto,@Res() res:Response){
  const file=await this.exports.download(u,q);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+file.filename+'"');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Report-SHA256',file.sha256);
  res.setHeader('Content-Length',file.buffer.length);
  return res.status(200).send(file.buffer);
 }
}
