import ExcelJS from 'exceljs';
import type {ExportPayload} from './report-table.js';
import {fieldLabel,isMoney,presentationValue,reportDaily,reportMetrics,
 reportPeriodLabel,reportTitle,sourceKeys} from './report-export-model.js';

// Rebuilt on ExcelJS (REP-exports refactor, 2026-11): the previous exporter wrote raw
// OOXML/zip bytes by hand, and "the exported file was corrupt/wouldn't open" was the
// recurring complaint. ExcelJS owns the zip/XML structure now; this file only decides
// content and styling, never byte layout.

const colors={
 navy:'FF142638',teal:'FF34475A',pale:'FFF4F6F8',line:'FFE2E7EC',
 gray:'FFF7F8F9',white:'FFFFFFFF',muted:'FF53677B',ink:'FF172B3C'
};
const decimalRe=/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const isIdField=(k:string)=>/id$/i.test(k)||/documentosConsumo/.test(k);

/** Returns an Excel number format for a money/plain-numeric column, or undefined for text. */
function numberFormat(key:string,raw:string,currency:string):string|undefined{
 if(isIdField(key)||!decimalRe.test(raw))return undefined;
 const dp=raw.includes('.')?raw.split('.')[1].length:0;
 if(isMoney(key)){
  const symbol=currency==='GTQ'?'"Q"':'"'+currency+'"';
  return symbol+' #,##0.'+'0'.repeat(dp>2?6:2);
 }
 if(dp>0)return '#,##0.'+'0'.repeat(Math.min(dp,6));
 return '#,##0';
}
function titleRow(ws:ExcelJS.Worksheet,text:string,opts:{size:number;bold?:boolean;color?:string;fill?:string;height?:number}){
 const row=ws.addRow([text]);
 row.height=opts.height??22;
 ws.mergeCells(row.number,1,row.number,4);
 const cell=row.getCell(1);
 cell.font={size:opts.size,bold:opts.bold,color:{argb:opts.color??colors.ink},name:'Aptos'};
 if(opts.fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:opts.fill}};
 cell.alignment={vertical:'middle',horizontal:'left'};
 if(opts.fill)for(let c=2;c<=4;c++)row.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:opts.fill}};
 return row;
}
function summarySheet(wb:ExcelJS.Workbook,r:ExportPayload){
 const ws=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 ws.columns=[{width:36},{width:25},{width:36},{width:25}];
 titleRow(ws,'GASTRO CORE  /  INFORMES',{size:19,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(ws,reportTitle(r),{size:13,bold:true,color:colors.navy,height:24});
 titleRow(ws,reportPeriodLabel(r),{size:11,bold:true,color:colors.teal,height:20});
 titleRow(ws,'Sucursal: '+r.sucursal.nombre+'  |  Moneda: '+r.currency,{size:10,color:colors.muted,height:18});
 titleRow(ws,'RESULTADOS PRINCIPALES',{size:12,bold:true,color:colors.teal,height:20});
 const metrics=reportMetrics(r).slice(0,8);
 for(let i=0;i<metrics.length;i+=2){
  const m=metrics[i],n=metrics[i+1];
  const row=ws.addRow([m.label,Number(m.value),n?.label??'',n?Number(n.value):null]);
  row.height=20;
  const fmtA=numberFormat(m.key,m.value,r.currency);
  if(fmtA)row.getCell(2).numFmt=fmtA;
  row.getCell(2).alignment={horizontal:'right'};
  row.getCell(1).font={bold:true,color:{argb:colors.ink}};
  if(n){
   const fmtB=numberFormat(n.key,n.value,r.currency);
   if(fmtB)row.getCell(4).numFmt=fmtB;
   row.getCell(4).alignment={horizontal:'right'};
   row.getCell(3).font={bold:true,color:{argb:colors.ink}};
  }
 }
 titleRow(ws,'MOVIMIENTOS Y DETALLE',{size:12,bold:true,color:colors.teal,height:20});
 titleRow(ws,'La hoja Diario agrupa los registros por fecha. La hoja Detalle muestra los documentos.',{size:9,color:colors.muted,height:18});
 titleRow(ws,'Importes según registros originales. Las diferencias de cobro y venta requieren conciliación.',{size:9,color:colors.muted,height:18});
}
function headerRow(ws:ExcelJS.Worksheet,labels:string[]){
 const row=ws.addRow(labels);
 row.height=22;
 row.eachCell(cell=>{
  cell.font={bold:true,color:{argb:colors.white},size:10};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.teal}};
  cell.alignment={vertical:'middle',wrapText:true};
 });
 return row;
}
function dataRow(ws:ExcelJS.Worksheet,values:unknown[],keys:string[],r:ExportPayload,band:boolean){
 const cells=keys.map((k,i)=>{
  const raw=values[i];
  const fmt=raw==null?undefined:numberFormat(k,String(raw),r.currency);
  return fmt?Number(raw):presentationValue(raw,k,r.periodo.zonaHoraria,r.currency);
 });
 const row=ws.addRow(cells);
 keys.forEach((k,i)=>{
  const raw=values[i];
  const fmt=raw==null?undefined:numberFormat(k,String(raw),r.currency);
  const cell=row.getCell(i+1);
  if(fmt){cell.numFmt=fmt;cell.alignment={horizontal:'right'};}
  if(band)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};
 });
 return row;
}
function dailySheet(wb:ExcelJS.Workbook,r:ExportPayload){
 const ws=wb.addWorksheet('Diario',{views:[{state:'frozen',ySplit:4}]});
 const d=reportDaily(r);
 const keys=[...new Set(d.rows.flatMap(x=>Object.keys(x)))];
 const columns=['fecha',...keys.filter(k=>k!=='fecha')];
 const fields=columns.length>1?columns:['fecha','registros'];
 ws.columns=fields.map(k=>({width:k==='fecha'?19:Math.max(18,Math.min(33,fieldLabel(k).length+8))}));
 const title=r.periodo.desde===r.periodo.hasta?
  'REPORTE DEL DÍA: '+r.periodo.desde.split('-').reverse().join('/'):
  'MOVIMIENTOS DIARIOS DEL PERÍODO';
 titleRow(ws,title,{size:16,bold:true,color:colors.navy,height:24});
 titleRow(ws,r.periodo.desde+' al '+r.periodo.hasta+'  |  '+r.sucursal.nombre,{size:11,color:colors.teal,height:18});
 titleRow(ws,'Movimientos agrupados por fecha operativa. El detalle conserva sus importes.',{size:9,color:colors.muted,height:18});
 headerRow(ws,fields.map(fieldLabel));
 d.rows.forEach((row,i)=>dataRow(ws,fields.map(k=>row[k]),fields,r,i%2===1));
 if(!d.rows.length){
  const row=ws.addRow(['No hay movimientos con fecha operativa verificable en esta fuente y período.']);
  ws.mergeCells(row.number,1,row.number,fields.length);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }else{
  ws.autoFilter={from:{row:4,column:1},to:{row:4+d.rows.length,column:fields.length}};
 }
}
function detailSheet(wb:ExcelJS.Workbook,r:ExportPayload){
 const ws=wb.addWorksheet('Detalle',{views:[{state:'frozen',ySplit:4}]});
 const keys=sourceKeys(r);
 ws.columns=keys.map(k=>{
  let width=Math.max(15,Math.min(28,fieldLabel(k).length+7));
  if(isIdField(k))width=31;
  else if(/descripcion|detalle|observacion|motivo|documentosConsumo/i.test(k))width=39;
  else if(/producto|proveedor|cliente/i.test(k))width=30;
  else if(/fecha|creadaEn|cerradaEn|canceladaEn/i.test(k))width=24;
  else if(/numeroOrden|numeroDocumento/i.test(k))width=24;
  return {width};
 });
 titleRow(ws,'DETALLE  |  '+reportTitle(r),{size:16,bold:true,color:colors.navy,height:24});
 titleRow(ws,'Sucursal '+r.sucursal.nombre+'  •  '+r.periodo.desde+' / '+r.periodo.hasta,{size:11,color:colors.teal,height:18});
 titleRow(ws,'Detalle de operaciones. Montos editables y sumables.',{size:9,color:colors.muted,height:18});
 headerRow(ws,keys.map(fieldLabel));
 r.data.forEach((row,i)=>dataRow(ws,keys.map(k=>row[k]),keys,r,i%2===1));
 if(r.data.length){
  const firstDataRow=5,lastDataRow=4+r.data.length;
  const row=ws.addRow(keys.map(()=>null));
  row.height=20;
  keys.forEach((k,i)=>{
   const numeric=r.data.every(item=>item[k]==null||decimalRe.test(String(item[k])))&&
    r.data.some(item=>item[k]!=null)&&!isIdField(k)&&!/fecha|estado|codigo|numero/i.test(k);
   const cell=row.getCell(i+1);
   if(numeric){
    const col=ws.getColumn(i+1).letter;
    cell.value={formula:'SUM('+col+firstDataRow+':'+col+lastDataRow+')'};
    const sampleFmt=numberFormat(k,String(r.data.find(x=>x[k]!=null)?.[k]??'0'),r.currency);
    if(sampleFmt)cell.numFmt=sampleFmt;
    cell.alignment={horizontal:'right'};
   }else if(i===0){
    cell.value='TOTAL (VERIFICACIÓN)';
   }
   cell.font={bold:true};
   cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.pale}};
  });
  ws.autoFilter={from:{row:4,column:1},to:{row:4+r.data.length,column:keys.length}};
 }
}
/**
 * ExcelJS's zip/XML assembly is inherently async (wb.xlsx.writeBuffer() returns a
 * Promise), unlike the old hand-rolled synchronous writer. Every caller in this module
 * already runs inside an async chain (report-export.service.ts → ReportExportController),
 * so this function stays a plain async function rather than faking a sync signature.
 */
export async function renderXlsxReport(r:ExportPayload):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt??Date.now());
 summarySheet(wb,r);
 dailySheet(wb,r);
 detailSheet(wb,r);
 const arrayBuffer=await wb.xlsx.writeBuffer();
 return Buffer.from(arrayBuffer);
}
