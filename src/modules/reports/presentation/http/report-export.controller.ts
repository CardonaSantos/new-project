import {Controller,Get,Header,Param,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ReportExportService} from '../../application/report-export.service.js';
import {ReportExportDto} from './dto/reports.dto.js';

@Controller('reports/analytics/exports')
export class ReportExportController{
 constructor(private readonly exports:ReportExportService){}
 @Get(':source') @Header('Cache-Control','private, no-store, max-age=0')
 async download(@CurrentUser() u:Principal,@Param('source') source:string,
  @Query() q:ReportExportDto,@Res() res:Response){
  const file=await this.exports.download(u,source,q);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+file.filename+'"');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Report-SHA256',file.sha256);
  res.setHeader('Content-Length',file.buffer.length);
  return res.status(200).send(file.buffer);
 }
}
