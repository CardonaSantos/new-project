import {sourceKeys,fieldLabel,isMoney,presentationValue} from './report-export-model.js';
import {renderXlsxReport} from './xlsx-renderer.js';
import {renderPdfReport} from './pdf-renderer.js';
// ExcelJS/pdfkit assemble their output asynchronously (unlike the old hand-rolled
// writers), so XLSX/PDF are Promise<Buffer> here; CSV stays a plain synchronous Buffer.
export type ExportFormat='CSV'|'XLSX'|'PDF';
export type ExportPayload={
 source:string;currency:string;
 periodo:{desde:string;hasta:string;zonaHoraria?:string;corte?:string};
 sucursal:{id:string;nombre:string};data:Record<string,unknown>[];
 meta:{total:number};totales?:unknown;exportacion?:unknown;
 generatedAt?:string;diario?:Record<string,unknown>[];diarioNota?:string;
};
const cellText=(v:unknown):string=>{
 if(v===null||v===undefined)return '';
 if(v instanceof Date)return v.toISOString();
 if(typeof v==='object')return JSON.stringify(v);
 return String(v);
};
export const exportTable=(r:ExportPayload)=>{
 const headers=sourceKeys(r);
 if(!headers.length)headers.push('sinRegistros');
 return {headers,rows:r.data.map(x=>headers.map(h=>/fecha|En$/i.test(h)?presentationValue(x[h],h,r.periodo.zonaHoraria):cellText(x[h])))};
};
const csvValue=(s:string)=>{
 // Keep raw technical column labels and source values. Protect spreadsheet
 // viewers against formula injection without changing actual numeric values.
 const unsafe=/^[=+\-@\t\r\n]/.test(s)&&!/^-[0-9]+(?:\.[0-9]+)?$/.test(s);
 const v=unsafe?"'"+s:s;
 return '"'+v.replace(/"/g,'""')+'"';
};
export function renderCsv(r:ExportPayload):Buffer{
 const t=exportTable(r);
 return Buffer.from('﻿'+[
  t.headers.map(h=>csvValue(fieldLabel(h)+(isMoney(h)?' ('+(r.currency==='GTQ'?'Q':r.currency)+')':''))).join(','),
  ...t.rows.map(row=>row.map(csvValue).join(','))
 ].join('\r\n')+'\r\n','utf8');
}
export const renderXlsx:(r:ExportPayload)=>Promise<Buffer>=renderXlsxReport;
export const renderPdf:(r:ExportPayload)=>Promise<Buffer>=renderPdfReport;
