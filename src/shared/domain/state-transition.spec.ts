import {describe,it,expect} from 'vitest';
import {assertTransition} from './state-transition.js';
import {money,decimalQuantity} from './money.js';
describe('Shared domain',()=>{
 it('money uses decimal strings',()=>{
  expect(money('0.10')).toBe('0.10');
  expect(money('12')).toBe('12.00');
  expect(()=>money('0.123')).toThrow();
  expect(decimalQuantity('0.001')).toBe('0.001000');
 });
 it('allows only declared transitions',()=>{
  const map={OPEN:['CLOSED'],CLOSED:[]} as const;
  expect(()=>assertTransition<'OPEN'|'CLOSED'>('OPEN','CLOSED',map)).not.toThrow();
  expect(()=>assertTransition<'OPEN'|'CLOSED'>('CLOSED','OPEN',map)).toThrow();
 });
});
