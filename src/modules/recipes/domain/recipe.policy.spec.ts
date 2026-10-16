import {describe,it,expect} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {quantity,proportion,gross,demand,ensureUnique,validCode} from './recipe.policy.js';
describe('REC-A decimal invariants',()=>{
 it('rejects zero, negative, scientific notation and excessive precision',()=>{
  for(const x of ['0','-1','1e6','3.1234567'])expect(()=>quantity(x)).toThrow();
  expect(quantity('0.123456').toFixed(6)).toBe('0.123456');
 });
 it('calculates gross consumption from expected waste without JS floating numbers',()=>{
  const net=new Prisma.Decimal('90');
  expect(gross(net,new Prisma.Decimal('10')).toFixed(6)).toBe('100.000000');
  expect(demand({cantidad:new Prisma.Decimal('90'),mermaPorcentaje:new Prisma.Decimal('10')},
   new Prisma.Decimal('2')).toFixed(6)).toBe('200.000000');
  expect(()=>proportion('100')).toThrow();
 });
 it('prevents duplicated components and malformed idempotency keys',()=>{
  expect(()=>ensureUnique([{id:'a'},{id:'a'}],x=>x.id,'Artículo')).toThrow();
  expect(()=>validCode('bad')).toThrow();
  expect(validCode('PROD:REQUEST:001')).toBe('PROD:REQUEST:001');
 });
});
