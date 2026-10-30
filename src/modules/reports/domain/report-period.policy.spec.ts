import {describe,expect,it} from 'vitest';
import {resolvePeriod,ensurePage} from './report-period.policy.js';
const at='2026-10-30';
describe('REP-A periods and report guardrails',()=>{
 it('covers exact operating day',()=>{
  expect(resolvePeriod({periodo:'DIA',fecha:at},at).dias).toEqual([at]);
 });
 it('starts Monday and finishes Sunday',()=>{
  const r=resolvePeriod({periodo:'SEMANA',fecha:at},at);
  expect([r.desde,r.hasta,r.dias.length]).toEqual(['2026-10-26','2026-11-01',7]);
 });
 it('handles month boundaries and leap years',()=>{
  expect(resolvePeriod({periodo:'MES',fecha:'2028-02-15'},at).hasta).toBe('2028-02-29');
 });
 it('includes both ends for custom dates',()=>{
  expect(resolvePeriod({periodo:'PERSONALIZADO',desde:'2026-10-30',hasta:'2026-11-02'},at).dias)
   .toEqual(['2026-10-30','2026-10-31','2026-11-01','2026-11-02']);
 });
 it('rejects non-existent days, reversed or excessive spans',()=>{
  expect(()=>resolvePeriod({periodo:'DIA',fecha:'2026-02-30'},at)).toThrow();
  expect(()=>resolvePeriod({periodo:'PERSONALIZADO',desde:'2026-11-02',hasta:'2026-10-30'},at)).toThrow();
  expect(()=>resolvePeriod({periodo:'PERSONALIZADO',desde:'2025-01-01',hasta:'2026-10-30'},at)).toThrow();
 });
 it('rejects unbounded pagination',()=>{
  expect(()=>ensurePage(0,20)).toThrow();
  expect(()=>ensurePage(1,101)).toThrow();
  expect(()=>ensurePage(1,20)).not.toThrow();
 });
});
