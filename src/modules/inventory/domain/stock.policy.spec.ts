import {describe,it,expect} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {amount,cost,qty,combineAverage,locationAverage,requireStock,validDay,requireReference} from './stock.policy.js';
import {weightedAverageFromBook,allocatePoolBookValues,bookKey} from './inventory-valuation.policy.js';
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


// Book money must not drift because the display average has six decimals.
describe('Inventory book-value reconciliation',()=>{
 it('keeps exact posted value while showing a six-decimal location average',()=>{
  const oldQty=new Prisma.Decimal('3400');
  const oldBook=new Prisma.Decimal('34');
  expect(weightedAverageFromBook(oldQty,oldBook,new Prisma.Decimal('100'),
   new Prisma.Decimal('0.02')).toFixed(6)).toBe('0.010286');
  const shares=allocatePoolBookValues([
   {id:'lot1',articuloId:'milk',ubicacionId:'ref',cantidad:new Prisma.Decimal('3400')},
   {id:'lot2',articuloId:'milk',ubicacionId:'ref',cantidad:new Prisma.Decimal('100')},
   {id:'dest',articuloId:'milk',ubicacionId:'dest',cantidad:new Prisma.Decimal('450')}
  ],new Map([
   [bookKey('milk','ref'),new Prisma.Decimal('36')],
   [bookKey('milk','dest'),new Prisma.Decimal('4.5')]
  ]));
  expect(shares.get('lot1')?.toFixed(6)).toBe('34.971429');
  expect(shares.get('lot2')?.toFixed(6)).toBe('1.028571');
  const total=[...shares.values()].reduce((a,b)=>a.plus(b),new Prisma.Decimal(0));
  expect(total.toFixed(6)).toBe('40.500000');
 });
 it('carries the last rounding fraction in the final position',()=>{
  const shares=allocatePoolBookValues([
   {id:'a',articuloId:'x',ubicacionId:'l',cantidad:new Prisma.Decimal(1)},
   {id:'b',articuloId:'x',ubicacionId:'l',cantidad:new Prisma.Decimal(1)},
   {id:'c',articuloId:'x',ubicacionId:'l',cantidad:new Prisma.Decimal(1)}
  ],new Map([[bookKey('x','l'),new Prisma.Decimal('1')]]));
  expect([...shares.values()].map(x=>x.toFixed(6))).toEqual([
   '0.333333','0.333333','0.333334']);
 });
});
