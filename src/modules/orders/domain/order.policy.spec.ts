import {describe,it,expect} from 'vitest';
import {decimal,key,price,qty,distinct,sha} from './order.policy.js';
import {Prisma} from '../../../generated/prisma/client.js';
describe('ORD-A basic invariants',()=>{
 it('rejects zero and unsafe quantities',()=>{
  for(const x of ['0','-1','1e5','0.000','1.0001'])expect(()=>decimal(x)).toThrow();
  expect(qty(decimal('1.5'))).toBe('1.500');
 });
 it('keeps monetary rounding at 2 decimals and stable hashes',()=>{
  expect(price(new Prisma.Decimal('10.235'))).toBe('10.24');
  expect(sha({a:1})).toBe(sha({a:1}));
 });
 it('requires a stable command key and distinct modifiers',()=>{
  expect(()=>key('x')).toThrow();
  expect(key('ORDER:2026:1')).toBe('ORDER:2026:1');
  expect(()=>distinct(['a','a'],x=>x,'Duplicado')).toThrow();
 });
});
