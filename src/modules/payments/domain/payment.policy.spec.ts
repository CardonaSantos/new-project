
import {describe,it,expect} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {money,formatted,operationalDate,assertShiftOperationalDate,ensureCoverage} from './payment.policy.js';
describe('PAY-A money and local business date',()=>{
 it('rejects floating input, non-positive and precision overflow',()=>{
  for(const bad of ['-1','1e3','1.234','0','NaN','2,50'])
   expect(()=>money(bad)).toThrow();
  expect(formatted(money('0',true))).toBe('0.00');
  expect(formatted(money('27.5'))).toBe('27.50');
 });
 it('prevents overcollection',()=>{
  expect(()=>ensureCoverage(new Prisma.Decimal('27'),new Prisma.Decimal('27.01'))).toThrow();
  expect(()=>ensureCoverage(new Prisma.Decimal('27'),new Prisma.Decimal('27'))).not.toThrow();
 });
 it('respects local time and 04:00 cut with Guatemala zone',()=>{
  expect(operationalDate(new Date('2026-10-16T09:59:00Z'),'America/Guatemala','04:00').toISOString())
   .toBe('2026-10-15T00:00:00.000Z');
  expect(operationalDate(new Date('2026-10-16T10:00:00Z'),'America/Guatemala','04:00').toISOString())
   .toBe('2026-10-16T00:00:00.000Z');
 });
 it('permits work across midnight until the local cutoff and rejects a stale shift thereafter',()=>{
  const day=new Date('2026-10-28T00:00:00.000Z');
  expect(()=>assertShiftOperationalDate(day,new Date('2026-10-29T09:59:00Z'),
   'America/Guatemala','04:00')).not.toThrow();
  expect(()=>assertShiftOperationalDate(day,new Date('2026-10-29T10:00:00Z'),
   'America/Guatemala','04:00')).toThrow('Turno de otro día operativo');
  expect(()=>assertShiftOperationalDate(new Date('2026-10-29T00:00:00.000Z'),
   new Date('2026-10-29T15:00:00Z'),'America/Guatemala','04:00')).not.toThrow();
  expect(()=>assertShiftOperationalDate(day,new Date('2026-10-29T09:00:00Z'),
   'America/Guatemala','03:00')).toThrow('Turno de otro día operativo');
 });
});
