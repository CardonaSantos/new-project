import {Controller,Get,Header,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryReportService} from '../../application/inventory-report.service.js';
import {InventoryReportExportService} from '../../application/inventory-report-export.service.js';
import {InventoryReportDto,InventoryReportExportDto} from './dto/inventory-report.dto.js';

@Controller('reports/inventory')
export class InventoryReportController{
 constructor(private readonly reports:InventoryReportService,
  private readonly exports:InventoryReportExportService){}
 @Get() @Header('Cache-Control','no-store')
 snapshot(@CurrentUser() u:Principal,@Query() q:InventoryReportDto){
  return this.reports.snapshot(u,{sucursalId:q.sucursalId,periodo:q.periodo,
   fecha:q.fecha,desde:q.desde,hasta:q.hasta,limite:q.limite});
 }
 @Get('export') @Header('Cache-Control','private, no-store, max-age=0')
 async download(@CurrentUser() u:Principal,@Query() q:InventoryReportExportDto,@Res() res:Response){
  const file=await this.exports.download(u,q);
  res.setHeader('Content-Type',file.mime);
  res.setHeader('Content-Disposition','attachment; filename="'+file.filename+'"');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Report-SHA256',file.sha256);
  res.setHeader('Content-Length',file.buffer.length);
  return res.status(200).send(file.buffer);
 }
}
