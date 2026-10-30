import {describe,expect,it} from 'vitest';
import {dateOnly,ensureExactCash} from './settlement.policy.js';
describe('DEL-A D3 policies',()=>{
 it('rejects calendar dates that cannot exist',()=>{
  expect(dateOnly('2026-02-28').toISOString().slice(0,10)).toBe('2026-02-28');
  expect(()=>dateOnly('2026-02-30')).toThrow();
  expect(()=>dateOnly('invalid')).toThrow();
 });
 it('does not silently settle missing money',()=>{
  expect(()=>ensureExactCash('22.00','22.00')).not.toThrow();
  expect(()=>ensureExactCash('22.00','21.00')).toThrow();
 });
});
