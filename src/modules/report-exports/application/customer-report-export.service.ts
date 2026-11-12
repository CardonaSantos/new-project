import {createHash} from 'node:crypto';
import {Injectable,PayloadTooLargeException} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import {CustomerReportService} from './customer-report.service.js';
import {renderCustomerReportXlsx} from './customer-report-xlsx.js';
import {renderCustomerReportPdf} from './customer-report-pdf.js';
import type {CustomerReportExportDto} from '../presentation/http/dto/customer-report.dto.js';

const mime:Record<'XLSX'|'PDF',string>={
 XLSX:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 PDF:'application/pdf'
};
@Injectable()
export class CustomerReportExportService{
 constructor(private readonly reports:CustomerReportService,private readonly db:PrismaService){}
 async download(u:Principal,q:CustomerReportExportDto){
  const snapshot=await this.reports.snapshot(u,{sucursalId:q.sucursalId,
   soloActivos:q.soloActivos,limite:q.limite});
  let buffer:Buffer;
  try{
   buffer=q.format==='XLSX'?await renderCustomerReportXlsx(snapshot):await renderCustomerReportPdf(snapshot);
  }catch(e){
   if(e instanceof RangeError)
    throw new PayloadTooLargeException('Reporte excesivamente extenso para PDF; use Excel');
   throw e;
  }
  const sha256=createHash('sha256').update(buffer).digest('hex');
  await this.db.eventoAuditoria.create({data:{
   usuarioId:u.id,sucursalId:snapshot.sucursal.id,
   accion:'REP_CUSTOMERS_EXPORT_GENERATED',entidad:'REPORTE',entidadId:'CUSTOMERS',
   despues:{formato:q.format,clientes:snapshot.clientes.length,sha256,bytes:buffer.length}
  }});
  const filename=['Gastro_Core_Clientes',snapshot.sucursal.id].join('_')+'.'+q.format.toLowerCase();
  return {buffer,mime:mime[q.format],filename,sha256};
 }
}
