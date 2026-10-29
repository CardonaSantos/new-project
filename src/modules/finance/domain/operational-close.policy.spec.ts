import {describe,expect,it} from 'vitest';
import {financialBusinessWindow,ensureCloseEligible} from './operational-close.policy.js';
describe('financial operational closing rules',()=>{
 it('uses local 04:00-to-04:00 day, including crossing UTC midnight',()=>{
  const w=financialBusinessWindow('2026-10-28','America/Guatemala','04:00');
  expect(w.from.toISOString()).toBe('2026-10-28T10:00:00.000Z');
  expect(w.to.toISOString()).toBe('2026-10-29T10:00:00.000Z');
 });
 it('rejects invalid dates and malformed cutoffs',()=>{
  expect(()=>financialBusinessWindow('2026-02-30','America/Guatemala','04:00')).toThrow();
  expect(()=>financialBusinessWindow('2026-10-28','America/Guatemala','25:00')).toThrow();
 });
 it('requires closed earlier day without open shifts or unfinished orders',()=>{
  const old=new Date('2026-10-28T00:00:00Z'),today=new Date('2026-10-29T00:00:00Z');
  expect(()=>ensureCloseEligible(old,today,0,0)).not.toThrow();
  expect(()=>ensureCloseEligible(today,today,0,0)).toThrow();
  expect(()=>ensureCloseEligible(old,today,1,0)).toThrow('turnos');
  expect(()=>ensureCloseEligible(old,today,0,1)).toThrow('órdenes');
 });
});
