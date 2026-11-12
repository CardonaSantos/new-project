import {describe,expect,it} from 'vitest';
import ExcelJS from 'exceljs';
import pdfParse from 'pdf-parse';
import {exportTable,renderCsv,renderXlsx,renderPdf,type ExportPayload} from './report-table.js';

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

describe('REP-exports: CSV renderer',()=>{
 it('retains RFC CSV, UTF-8 BOM, full source detail and spreadsheet injection protection',()=>{
  const csv=renderCsv(sample);
  expect(csv.subarray(0,3)).toEqual(Buffer.from([0xef,0xbb,0xbf]));
  const text=csv.toString('utf8');
  expect(text).toContain('"ORD-1"');
  expect(text).not.toContain('ordenId');
  expect(text).toContain('"Ingresos (Q)"');
  expect(text).toContain('"\'=1+2"');
  expect(text).toContain('"\'+SUM(A1)"');
  expect(text).toContain('\r\n');
  expect(exportTable(sample).headers).toEqual(['fecha','numeroOrden','ingreso','costoDirecto','detalle']);
 });
 it('supports empty datasets without a blank header row',()=>{
  const csv=renderCsv({...sample,data:[],meta:{total:0}}).toString('utf8');
  expect(csv).toContain('Sin registros');
 });
});

describe('REP-exports: XLSX renderer (ExcelJS)',()=>{
 it('produces a workbook with Resumen/Diario/Detalle sheets, readable back by ExcelJS itself',async()=>{
  const buffer=await renderXlsx(sample);
  expect(buffer.subarray(0,2).toString()).toBe('PK'); // a real zip, not corrupted bytes
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  expect(wb.worksheets.map(ws=>ws.name)).toEqual(['Resumen','Diario','Detalle']);
  const summary=wb.getWorksheet('Resumen')!;
  const titles=summary.getColumn(1).values.map(v=>String(v??''));
  expect(titles.some(t=>t.includes('Costos y margen de ventas'))).toBe(true);
  expect(titles.some(t=>t.includes('REPORTE DEL PERÍODO'))).toBe(true);
 });
 it('writes money as real numbers with a Q number format, not strings, and hides raw ids',()=>{
  return renderXlsx(sample).then(async buffer=>{
   const wb=new ExcelJS.Workbook();
   await wb.xlsx.load(buffer);
   const detail=wb.getWorksheet('Detalle')!;
   const header=detail.getRow(4).values as unknown[];
   expect(header).not.toContain('ordenId');
   // costoDirecto is the 4th business column (fecha, numeroOrden, ingreso, costoDirecto, detalle)
   const costCell=detail.getRow(5).getCell(4);
   expect(typeof costCell.value).toBe('number');
   expect(costCell.numFmt).toContain('Q');
   expect(costCell.numFmt).toContain('000000'); // 6-decimal micro-cost format, matches fractional input
  });
 });
 it('sums numeric columns with a live SUM formula on the totals row',async()=>{
  const buffer=await renderXlsx(sample);
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const detail=wb.getWorksheet('Detalle')!;
  const totalsRow=detail.getRow(4+sample.data.length+1);
  const formulas=(totalsRow.values as unknown[]).filter(v=>v&&typeof v==='object'&&'formula' in (v as object));
  expect(formulas.length).toBeGreaterThan(0);
 });
 it('groups the Diario sheet by operational day',async()=>{
  const buffer=await renderXlsx(sample);
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const daily=wb.getWorksheet('Diario')!;
  const dates=daily.getColumn(1).values.map(v=>String(v??''));
  expect(dates.some(d=>d.includes('16/10/2026'))).toBe(true);
  expect(dates.some(d=>d.includes('30/10/2026'))).toBe(true);
 });
 it('handles an empty dataset without throwing and still produces a loadable workbook',async()=>{
  const buffer=await renderXlsx({...sample,data:[],meta:{total:0}});
  const wb=new ExcelJS.Workbook();
  await expect(wb.xlsx.load(buffer)).resolves.not.toThrow();
 });
});

describe('REP-exports: PDF renderer (pdfkit)',()=>{
 it('produces a real, parseable PDF with the report title and business data, no raw ids',async()=>{
  const buffer=await renderPdf(sample);
  expect(buffer.subarray(0,4).toString('latin1')).toBe('%PDF');
  const parsed=await pdfParse(buffer);
  expect(parsed.text).toContain('ORD-1');
  expect(parsed.text).not.toContain('ordenId');
  expect(parsed.numpages).toBeGreaterThanOrEqual(2); // cover + at least one detail page
 });
 it('skips the redundant daily page for a single-day report but keeps it for a range',async()=>{
  const oneDay=await renderPdf({...sample,periodo:{...sample.periodo,desde:'2026-10-30',hasta:'2026-10-30'}});
  const multiDay=await renderPdf(sample);
  const oneDayPages=(await pdfParse(oneDay)).numpages;
  const multiDayPages=(await pdfParse(multiDay)).numpages;
  expect(multiDayPages).toBeGreaterThan(oneDayPages);
 });
 it('supports an empty dataset without throwing',async()=>{
  const buffer=await renderPdf({...sample,data:[],meta:{total:0}});
  expect(buffer.subarray(0,4).toString('latin1')).toBe('%PDF');
 });
 it('rejects a single business-text field so wide no page could ever show it, asking for XLSX/CSV instead',async()=>{
  const long='ABCDEFGHIJ '.repeat(400); // far beyond any reasonable column width/page height
  const huge={...sample,source:'SUPPLIER_BALANCES',
   data:[{numeroDocumento:'DOC-1',proveedor:long,saldo:'0.00'}],
   totales:{saldo:'0.00'},meta:{total:1}};
  await expect(renderPdf(huge)).rejects.toThrow(/espacio permitido|use XLSX\/CSV/i);
 });
});
