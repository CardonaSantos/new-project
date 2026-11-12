import {describe,expect,it} from 'vitest';
import type {ExportPayload} from './report-table.js';
import {reportDaily,reportMetrics,businessColumns,sourceKeys,isMoney} from './report-export-model.js';

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

describe('report-export-model: data shaping shared by CSV/XLSX/PDF',()=>{
 it('hides internal ids from the delivered columns but keeps business fields',()=>{
  expect(sourceKeys(sample)).toEqual(['fecha','numeroOrden','ingreso','costoDirecto','detalle']);
 });
 it('computes operational-day grouping from sale timestamps and preserves six decimals',()=>{
  const daily=reportDaily(sample);
  expect(daily.rows.map(r=>r.fecha)).toEqual(['2026-10-16','2026-10-30']);
  expect(daily.rows[0].costoDirecto).toBe('0.771429');
  expect(reportMetrics(sample)[0].key).toBe('ingresos');
  expect(businessColumns(sample)).toContain('numeroOrden');
 });
 it('respects the 04:00 branch day cutoff and does not invent missing margins',()=>{
  const z=reportDaily({...sample,data:[
   {fecha:'2026-10-30T09:59:00.000Z',ingreso:'12.00',costoDirecto:null},
   {fecha:'2026-10-30T10:00:00.000Z',ingreso:'22.00',costoDirecto:'1.234567'}
  ],meta:{total:2}});
  expect(z.rows.map(x=>x.fecha)).toEqual(['2026-10-29','2026-10-30']);
  expect(z.rows[0].costoDirecto).toBeUndefined();
  expect(z.rows[1].costoDirecto).toBe('1.234567');
 });
 it('supports empty datasets without inventing a date grouping or monetary totals',()=>{
  const r={...sample,data:[],meta:{total:0}};
  expect(sourceKeys(r)).toEqual(['sinRegistros']);
  expect(reportMetrics(r)[0].key).toBe('ingresos'); // falls back to totales, not an empty-data metric
  expect(reportDaily(r).rows).toEqual([]);
 });
 it('flags fields as money by name, not by looking like a number',()=>{
  expect(isMoney('ingreso')).toBe(true);
  expect(isMoney('costoDirecto')).toBe(true);
  expect(isMoney('cantidad')).toBe(false);
  expect(isMoney('registros')).toBe(false);
 });
 it('a source with no natural per-row date explains why, instead of fabricating one',()=>{
  const r={...sample,source:'SUPPLIER_BALANCES',
   data:[{numeroDocumento:'DOC-1',proveedor:'ACME',saldo:'0.00'}],
   totales:{saldo:'0.00'},meta:{total:1}};
  const daily=reportDaily(r);
  expect(daily.rows).toEqual([]);
  expect(daily.note).toMatch(/no se asignaron fechas inventadas/i);
 });
});
