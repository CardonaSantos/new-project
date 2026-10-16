
import {describe,it,expect} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {cash,dec,taxLine,covered,invoiceNumbers} from './purchase.policy.js';
describe('PUR-A monetary invariants',()=>{
 it('rejects bad numbers and impossible allocation',()=>{
  expect(()=>cash('-2')).toThrow();
  expect(()=>cash('1.234')).toThrow();
  expect(()=>dec('1e6')).toThrow();
  expect(()=>covered(new Prisma.Decimal(5),new Prisma.Decimal(4))).toThrow();
  expect(invoiceNumbers('  abc-  01  ')).toBe('ABC- 01');
 });
 it('computes inclusive and exclusive tax exactly',()=>{
  const q=new Prisma.Decimal('2'),rate=new Prisma.Decimal('0.12');
  const a=taxLine(q,new Prisma.Decimal('11.20'),rate,true);
  expect(a.base.toFixed(2)).toBe('20.00');
  expect(a.tax.toFixed(2)).toBe('2.40');
  const b=taxLine(q,new Prisma.Decimal('10'),rate,false);
  expect(b.base.toFixed(2)).toBe('20.00');
  expect(b.total.toFixed(2)).toBe('22.40');
 });
});
