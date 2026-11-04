import {describe,expect,it} from 'vitest';
import {branchMidnight,salesDateRange,salesSearch} from './sales-filter.policy.js';
describe('PAY-A — filtros de ventas por fecha de sucursal',()=>{
 it('construye el día completo de Guatemala incluyendo la fecha final',()=>{
  const d=salesDateRange({desde:'2026-11-03',hasta:'2026-11-03'},'America/Guatemala');
  expect(d.gte?.toISOString()).toBe('2026-11-03T06:00:00.000Z');
  expect(d.lt?.toISOString()).toBe('2026-11-04T06:00:00.000Z');
 });
 it('considera cambios de horario de verano en zonas distintas',()=>{
  expect(branchMidnight('2026-03-08','America/New_York').toISOString())
   .toBe('2026-03-08T05:00:00.000Z');
  expect(branchMidnight('2026-03-09','America/New_York').toISOString())
   .toBe('2026-03-09T04:00:00.000Z');
 });
 it('permite rangos abiertos y no inventa filtros',()=>{
  expect(salesDateRange({},'America/Guatemala')).toEqual({gte:undefined,lt:undefined});
  expect(salesDateRange({hasta:'2026-11-03'},'America/Guatemala').lt?.toISOString())
   .toBe('2026-11-04T06:00:00.000Z');
 });
 it('rechaza calendarios inválidos, rangos invertidos y excesivamente amplios',()=>{
  expect(()=>salesDateRange({desde:'2026-02-30'},'America/Guatemala')).toThrow();
  expect(()=>salesDateRange({desde:'2026-11-04',hasta:'2026-11-03'},'America/Guatemala')).toThrow();
  expect(()=>salesDateRange({desde:'2025-01-01',hasta:'2026-11-03'},'America/Guatemala')).toThrow();
 });
 it('limpia búsqueda y limita texto',()=>{
  expect(salesSearch(' ORD-123  ')).toBe('ORD-123');
  expect(salesSearch()).toBe('');
  expect(()=>salesSearch('a'.repeat(101))).toThrow();
 });
});
