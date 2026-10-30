import {describe,expect,it} from 'vitest';
import {inflateRawSync} from 'node:zlib';
import {exportTable,renderCsv,renderXlsx,renderPdf,type ExportPayload}
 from './report-export-formats.js';

const sample:ExportPayload={source:'SALES_COSTS',currency:'GTQ',
 sucursal:{id:'s1',nombre:'Principal'},
 periodo:{desde:'2026-10-01',hasta:'2026-10-30'},meta:{total:2},
 totales:{ingresos:'22.00',costo:'1.542857'},
 data:[{ordenId:'o1',ingreso:'11.00',costoDirecto:'0.771429',detalle:'=1+2'},
       {ordenId:'o2',ingreso:'11.00',costoDirecto:'0.771428',detalle:'+SUM(A1)'}]};
function unzipEntry(zip:Buffer,name:string):string{
 let pos=0;
 while(pos<zip.length&&zip.readUInt32LE(pos)===0x04034b50){
  const method=zip.readUInt16LE(pos+8),packed=zip.readUInt32LE(pos+18);
  const namelen=zip.readUInt16LE(pos+26),extra=zip.readUInt16LE(pos+28);
  const filename=zip.subarray(pos+30,pos+30+namelen).toString('utf8');
  const from=pos+30+namelen+extra,body=zip.subarray(from,from+packed);
  if(filename===name)return (method===8?inflateRawSync(body):body).toString('utf8');
  pos=from+packed;
 }
 throw new Error('zip entry not found: '+name);
}
describe('REP-2 export renderers',()=>{
 it('includes all columns, encodes UTF-8 and neutralizes spreadsheet injection in CSV',()=>{
  const csv=renderCsv(sample);
  expect(csv.subarray(0,3)).toEqual(Buffer.from([0xef,0xbb,0xbf]));
  expect(csv.toString('utf8')).toContain('"o1","11.00","0.771429","\'=1+2"');
  expect(csv.toString('utf8')).toContain('"\'+SUM(A1)"');
  expect(csv.toString('utf8')).toContain('\r\n');
  expect(exportTable(sample).headers).toEqual(['ordenId','ingreso','costoDirecto','detalle']);
 });
 it('builds a genuine XLSX ZIP with safe strings, two sheets and SUM formulas',()=>{
  const zip=renderXlsx(sample);
  expect(zip.subarray(0,2).toString()).toBe('PK');
  const workbook=unzipEntry(zip,'xl/workbook.xml');
  const data=unzipEntry(zip,'xl/worksheets/sheet1.xml');
  const styles=unzipEntry(zip,'xl/styles.xml');
  const recap=unzipEntry(zip,'xl/worksheets/sheet2.xml');
  expect(workbook).toContain('name="Datos"');
  expect(workbook).toContain('name="Resumen"');
  expect(data).toContain('<f>SUM(B2:B3)</f>');
  expect(data).toContain('<f>SUM(C2:C3)</f>');
  expect(data).toContain('t="inlineStr"><is><t>=1+2</t>');
  expect(styles).toContain('formatCode="0.000000"');
  expect(recap).toContain('REPEATABLE_READ');
 });
 it('renders multi-panel page-valid PDF with every column and no external links',()=>{
  const obj={...sample,data:[{a:'cafe',b:'22',c:'1',d:'hello',
   e:'x',f:'y',g:'=danger'},{a:'ok',b:'21',c:'2',d:'a',
   e:'b',f:'c',g:'last'}],meta:{total:2}};
  const pdf=renderPdf(obj);
  const text=pdf.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text).toContain('/Count 2');
  expect(text).toContain('Columnas 7-7 de 7');
  expect(text).toContain('xref');
  const at=Number(text.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  expect(text.slice(at,at+4)).toBe('xref');
 });
 it('exports empty datasets without inventing monetary totals',()=>{
  const obj={...sample,data:[],meta:{total:0}};
  expect(renderCsv(obj).toString('utf8')).toContain('sinRegistros');
  expect(renderXlsx(obj).subarray(0,2).toString()).toBe('PK');
  expect(renderPdf(obj).toString('latin1')).toContain('/Count 1');
 });
});
