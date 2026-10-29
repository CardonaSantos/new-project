import {describe,it,expect} from 'vitest';
import {assertStatementAmount,assertBankDate,assertReversibleSource} from './bank-reconciliation.policy.js';
describe('Finance settlement domain policies',()=>{
 it('rejects invalid amount and impossible bank date',()=>{
  for(const n of ['0','0.00','NaN','1.234','-0.00','-1e2'])expect(()=>assertStatementAmount(n)).toThrow();
  expect(()=>assertStatementAmount('-5.00')).not.toThrow();
  expect(()=>assertStatementAmount('12.34')).not.toThrow();
  expect(()=>assertBankDate('2026-02-30')).toThrow();
  expect(assertBankDate('2026-10-29').toISOString()).toBe('2026-10-29T00:00:00.000Z');
 });
 it('forbids reversing source-bound paid transactions via ledger',()=>{
  expect(()=>assertReversibleSource('GASTO_OPERATIVO')).not.toThrow();
  expect(()=>assertReversibleSource('PAGO')).toThrow();
  expect(()=>assertReversibleSource('REEMBOLSO_PAGO')).toThrow();
 });
});
