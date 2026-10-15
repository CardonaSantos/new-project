import {describe,it,expect} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {amount,cost,qty,combineAverage,locationAverage,requireStock,validDay,requireReference} from './stock.policy.js';
describe('Inventory posting invariants',()=>{
 it('uses precise decimals instead of JavaScript floating arithmetic',()=>{
  expect(qty(amount('0.100001').plus(amount('0.200002')))).toBe('0.300003');
  expect(combineAverage(new Prisma.Decimal(10),new Prisma.Decimal(2),new Prisma.Decimal(10),new Prisma.Decimal(4)).toFixed(6)).toBe('3.000000');
 });
 it('weights all physical lots of the same article and location',()=>{
  const old=[{cantidad:amount('10'),costoPromedio:cost('2')},
   {cantidad:amount('5'),costoPromedio:cost('4')}];
  expect(locationAverage(old,amount('5'),cost('8')).toFixed(6)).toBe('4.000000');
 });
 it('rejects zero, negatives, scientific notation and excess precision',()=>{
  for(const invalid of ['-2','0','1e6','1.1234567','01','foo'])expect(()=>amount(invalid)).toThrow();
  expect(cost('0').toFixed(6)).toBe('0.000000');
  expect(()=>cost('-0.01')).toThrow();
  expect(()=>requireStock(amount('1'),amount('2'))).toThrow();
 });
 it('rejects invalid dates and invalid idempotency keys',()=>{
  expect(()=>validDay('2026-02-30')).toThrow();
  expect(validDay('2026-10-15').toISOString()).toBe('2026-10-15T00:00:00.000Z');
  expect(()=>requireReference('x')).toThrow();
 });
});
