import {createHash} from 'node:crypto';
import {Injectable,PayloadTooLargeException} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import {DomainReportsService} from './domain-reports.service.js';
import {renderCsv,renderPdf,renderXlsx,type ExportPayload,type ExportFormat}
 from './report-export-formats.js';
import type {ReportExportDto} from '../presentation/http/dto/reports.dto.js';

const mime:Record<ExportFormat,string>={
 CSV:'text/csv; charset=utf-8',
 XLSX:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 PDF:'application/pdf'
};
@Injectable()
export class ReportExportService{
 constructor(private readonly reports:DomainReportsService,
  private readonly db:PrismaService){}
 async download(u:Principal,source:string,q:ReportExportDto){
  const snapshot=await this.reports.exportRecords(u,source,{
   sucursalId:q.sucursalId,periodo:q.periodo,
   fecha:q.fecha,desde:q.desde,hasta:q.hasta,page:1,limit:100
  }) as ExportPayload;
  const render:Record<ExportFormat,(r:ExportPayload)=>Buffer>={
   CSV:renderCsv,XLSX:renderXlsx,PDF:renderPdf
  };
  if(Buffer.byteLength(JSON.stringify(snapshot),'utf8')>5_000_000)
   throw new PayloadTooLargeException('Exportación supera 5 MB de datos; reduzca período');
  let buffer:Buffer;
  try{buffer=render[q.format](snapshot);}
  catch(e){
   if(e instanceof RangeError)
    throw new PayloadTooLargeException('PDF excesivamente extenso; use CSV/XLSX o reduzca período');
   throw e;
  }
  const sha256=createHash('sha256').update(buffer).digest('hex');
  // Audit the exact delivered bytes; do not persist PII or financial records
  // in the audit table. Never send an unaudited attachment.
  await this.db.eventoAuditoria.create({data:{
   usuarioId:u.id,sucursalId:snapshot.sucursal.id,
   accion:'REP_EXPORT_GENERATED',entidad:'REPORTE',
   entidadId:source,despues:{
    formato:q.format,source,desde:snapshot.periodo.desde,
    hasta:snapshot.periodo.hasta,registros:snapshot.meta.total,
    sha256,bytes:buffer.length,snapshot:'REPEATABLE_READ'
   }
  }});
  const filename=['Gastro_Core',source,snapshot.sucursal.id,
   snapshot.periodo.desde,snapshot.periodo.hasta].join('_')+'.'+q.format.toLowerCase();
  return {buffer,mime:mime[q.format],filename,sha256};
 }
}
