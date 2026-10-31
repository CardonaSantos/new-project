import {describe,expect,it} from 'vitest';
import {inflateRawSync} from 'node:zlib';
import {exportTable,renderCsv,renderXlsx,renderPdf,type ExportPayload}
 from './report-export-formats.js';
import {reportDaily,reportMetrics,businessColumns} from './professional-export-model.js';

const sample:ExportPayload={source:'SALES_COSTS',currency:'GTQ',
 sucursal:{id:'s1',nombre:'Principal'},
 periodo:{desde:'2026-10-01',hasta:'2026-10-30',
  zonaHoraria:'America/Guatemala',corte:'04:00'},meta:{total:2},
 totales:{ingresos:'22.00',costoIdentificado:'1.542857',
  margenAntesEmpaque:'20.457143',lineasConCosto:2},
 data:[{ordenId:'o1',numeroOrden:'ORD-1',fecha:'2026-10-16T21:30:00.000Z',
  ingreso:'11.00',costoDirecto:'0.771429',detalle:'=1+2'},
 {ordenId:'o2',numeroOrden:'ORD-2',fecha:'2026-10-30T16:00:00.000Z',
  ingreso:'11.00',costoDirecto:'0.771428',detalle:'+SUM(A1)'}]};
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
describe('REP-2B professional export renderers',()=>{
 it('retains RFC CSV, UTF8 BOM, full source detail and spreadsheet injection protection',()=>{
  const csv=renderCsv(sample);
  expect(csv.subarray(0,3)).toEqual(Buffer.from([0xef,0xbb,0xbf]));
  expect(csv.toString('utf8')).toContain('"o1","ORD-1"');
  expect(csv.toString('utf8')).toContain('"\'=1+2"');
  expect(csv.toString('utf8')).toContain('"\'+SUM(A1)"');
  expect(csv.toString('utf8')).toContain('\r\n');
  expect(exportTable(sample).headers).toEqual(['ordenId','numeroOrden','fecha','ingreso',
   'costoDirecto','detalle']);
 });
 it('generates validly ordered OOXML styles and three human-readable XLSX worksheets',()=>{
  const zip=renderXlsx(sample);
  expect(zip.subarray(0,2).toString()).toBe('PK');
  const wb=unzipEntry(zip,'xl/workbook.xml');
  const styles=unzipEntry(zip,'xl/styles.xml');
  const summary=unzipEntry(zip,'xl/worksheets/sheet1.xml');
  const daily=unzipEntry(zip,'xl/worksheets/sheet2.xml');
  const detail=unzipEntry(zip,'xl/worksheets/sheet3.xml');
  expect(wb).toContain('name="Resumen"');
  expect(wb).toContain('name="Diario"');
  expect(wb).toContain('name="Detalle"');
  expect(summary).toContain('INDICADORES PRINCIPALES');
  expect(summary).toContain('Costos y margen de ventas');
  expect(daily).toContain('2026-10-16');
  expect(daily).toContain('2026-10-30');
  expect(detail).toContain('<cols><col min="1"');
  expect(detail).toContain('width="');
  expect(detail).toContain('autoFilter ref="A4:');
  expect(detail).toContain('<f>SUM(');
  expect(detail).toContain('t="inlineStr"><is><t xml:space="preserve">=1+2</t>');
  expect(styles).toContain('formatCode="#,##0.000000"');
  expect(styles.indexOf('<numFmts')).toBeLessThan(styles.indexOf('<fonts'));
  expect(styles.indexOf('<fonts')).toBeLessThan(styles.indexOf('<fills'));
  expect(styles.indexOf('<fills')).toBeLessThan(styles.indexOf('<borders'));
  expect(styles.indexOf('<borders')).toBeLessThan(styles.indexOf('<cellStyleXfs'));
  expect(styles.indexOf('<cellStyleXfs')).toBeLessThan(styles.indexOf('<cellXfs'));
 });
 it('renders executive + daily + business-detail PDF without technical-column panels',()=>{
  const pdf=renderPdf(sample);
  const t=pdf.toString('latin1');
  expect(t.startsWith('%PDF-1.4')).toBe(true);
  expect(t).toContain('/Count 3');
  expect(t).toContain('INDICADORES DEL PER');
  expect(t).toContain('INFORMACI');
  expect(t).toContain('DETALLE OPERATIVO');
  expect(t).toContain('ORD-1');
  expect(t).not.toContain('Columnas 1-6 de');
  const xref=Number(t.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  expect(t.slice(xref,xref+4)).toBe('xref');
 });
 it('preserves long business text in PDF by wrapping across lines',()=>{
  const long='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3);
  const r={...sample,source:'SUPPLIER_BALANCES',
   data:[{proveedor:long,numeroDocumento:'DOC-123',saldo:'0.00'}],
   totales:{saldo:'0.00'},meta:{total:1}};
  const pdf=renderPdf(r).toString('latin1');
  expect(pdf).toContain('ABCDEFGHIJKLMNOP');
  expect(pdf).toContain('QRSTUVWXYZ');
  expect(pdf).toContain('/Helvetica-Bold');
 });
 it('computes operational-day grouping from sale timestamps and preserves six decimals',()=>{
  const daily=reportDaily(sample);
  expect(daily.rows.map(r=>r.fecha)).toEqual(['2026-10-16','2026-10-30']);
  expect(daily.rows[0].costoDirecto).toBe('0.771429');
  expect(reportMetrics(sample)[0].key).toBe('ingresos');
  expect(businessColumns(sample)).toContain('numeroOrden');
 });
 it('respects 04:00 branch day cutoff and does not invent missing margins',()=>{
  const z=reportDaily({...sample,data:[
   {fecha:'2026-10-30T09:59:00.000Z',ingreso:'12.00',costoDirecto:null},
   {fecha:'2026-10-30T10:00:00.000Z',ingreso:'22.00',costoDirecto:'1.234567'}
  ],meta:{total:2}});
  expect(z.rows.map(x=>x.fecha)).toEqual(['2026-10-29','2026-10-30']);
  expect(z.rows[0].costoDirecto).toBeUndefined();
  expect(z.rows[1].costoDirecto).toBe('1.234567');
 });
 it('supports empty financial datasets without invented monetary totals',()=>{
  const r={...sample,data:[],meta:{total:0}};
  expect(renderCsv(r).toString()).toContain('sinRegistros');
  expect(renderXlsx(r).subarray(0,2).toString()).toBe('PK');
  expect(renderPdf(r).toString('latin1')).toContain('Sin desglose');
 });
});
