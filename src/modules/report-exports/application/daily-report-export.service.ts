import {createHash} from 'node:crypto';
import {Injectable,PayloadTooLargeException} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import {DailyReportService} from './daily-report.service.js';
import {renderDailyReportXlsx} from './daily-report-xlsx.js';
import {renderDailyReportPdf} from './daily-report-pdf.js';
import type {DailyReportExportDto} from '../presentation/http/dto/daily-report.dto.js';

const mime:Record<'XLSX'|'PDF',string>={
 XLSX:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 PDF:'application/pdf'
};
@Injectable()
export class DailyReportExportService{
 constructor(private readonly reports:DailyReportService,private readonly db:PrismaService){}
 async download(u:Principal,q:DailyReportExportDto){
  const snapshot=await this.reports.snapshot(u,{sucursalId:q.sucursalId,fecha:q.fecha});
  let buffer:Buffer;
  try{
   buffer=q.format==='XLSX'?await renderDailyReportXlsx(snapshot):await renderDailyReportPdf(snapshot);
  }catch(e){
   if(e instanceof RangeError)
    throw new PayloadTooLargeException('Reporte excesivamente extenso para PDF; use Excel');
   throw e;
  }
  const sha256=createHash('sha256').update(buffer).digest('hex');
  await this.db.eventoAuditoria.create({data:{
   usuarioId:u.id,sucursalId:snapshot.sucursal.id,
   accion:'REP_DAILY_EXPORT_GENERATED',entidad:'REPORTE',entidadId:'DAILY',
   despues:{formato:q.format,fecha:snapshot.fecha,sha256,bytes:buffer.length}
  }});
  const filename=['Gastro_Core_ReporteDia',snapshot.sucursal.id,snapshot.fecha].join('_')+
   '.'+q.format.toLowerCase();
  return {buffer,mime:mime[q.format],filename,sha256};
 }
}
