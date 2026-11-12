import {createHash} from 'node:crypto';
import {Injectable,PayloadTooLargeException} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryReportService} from './inventory-report.service.js';
import {renderInventoryReportXlsx} from './inventory-report-xlsx.js';
import {renderInventoryReportPdf} from './inventory-report-pdf.js';
import type {InventoryReportExportDto} from '../presentation/http/dto/inventory-report.dto.js';

const mime:Record<'XLSX'|'PDF',string>={
 XLSX:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 PDF:'application/pdf'
};
@Injectable()
export class InventoryReportExportService{
 constructor(private readonly reports:InventoryReportService,private readonly db:PrismaService){}
 async download(u:Principal,q:InventoryReportExportDto){
  const snapshot=await this.reports.snapshot(u,{sucursalId:q.sucursalId,periodo:q.periodo,
   fecha:q.fecha,desde:q.desde,hasta:q.hasta,limite:q.limite});
  let buffer:Buffer;
  try{
   buffer=q.format==='XLSX'?await renderInventoryReportXlsx(snapshot):await renderInventoryReportPdf(snapshot);
  }catch(e){
   if(e instanceof RangeError)
    throw new PayloadTooLargeException('Reporte excesivamente extenso para PDF; use Excel');
   throw e;
  }
  const sha256=createHash('sha256').update(buffer).digest('hex');
  await this.db.eventoAuditoria.create({data:{
   usuarioId:u.id,sucursalId:snapshot.sucursal.id,
   accion:'REP_INVENTORY_EXPORT_GENERATED',entidad:'REPORTE',entidadId:'INVENTORY',
   despues:{formato:q.format,desde:snapshot.periodo.desde,hasta:snapshot.periodo.hasta,
    sha256,bytes:buffer.length}
  }});
  const filename=['Gastro_Core_Inventario',snapshot.sucursal.id,snapshot.periodo.desde,
   snapshot.periodo.hasta].join('_')+'.'+q.format.toLowerCase();
  return {buffer,mime:mime[q.format],filename,sha256};
 }
}
