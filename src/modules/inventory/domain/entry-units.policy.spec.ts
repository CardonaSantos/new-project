import {describe,it,expect} from 'vitest';
import {Prisma} from '../../../generated/prisma/client.js';
import {entryDetail,resolveEntry} from './entry-units.policy.js';

const D=(v:string)=>new Prisma.Decimal(v);

describe('Entries typed in a purchase unit',()=>{
 it('keeps a plain base-unit entry exactly as before (no total override)',()=>{
  expect(resolveEntry({cantidad:'2000',costoUnitario:'0.02'},null))
   .toEqual({cantidad:'2000.000000',costoUnitario:'0.020000'});
 });
 it('converts «2 L at Q20 each» into ml and cost per ml, booking the exact total',()=>{
  expect(resolveEntry({cantidad:'2',costoUnitario:'20'},D('1000')))
   .toEqual({cantidad:'2000.000000',costoUnitario:'0.020000',costoTotal:'40.000000'});
 });
 it('converts «2 L, Q40 in all» the same way',()=>{
  expect(resolveEntry({cantidad:'2',costoTotal:'40'},D('1000')))
   .toEqual({cantidad:'2000.000000',costoUnitario:'0.020000',costoTotal:'40.000000'});
 });
 it('keeps the paid total exact when the per-unit cost does not divide evenly',()=>{
  const r=resolveEntry({cantidad:'1',costoTotal:'20'},D('946'));
  expect(r.costoTotal).toBe('20.000000');
  expect(r.costoUnitario).toBe('0.021142');
 });
 it('accepts a total in base units too',()=>{
  expect(resolveEntry({cantidad:'500',costoTotal:'10'},null))
   .toEqual({cantidad:'500.000000',costoUnitario:'0.020000',costoTotal:'10.000000'});
 });
 it('uses a presentation factor (one 5-gallon jug in ml)',()=>{
  const r=resolveEntry({cantidad:'2',costoUnitario:'35'},D('18927.05892'));
  expect(r.cantidad).toBe('37854.117840');
  expect(r.costoTotal).toBe('70.000000');
 });
 it('quantity only, for outbound and waste',()=>{
  expect(resolveEntry({cantidad:'1.5'},D('453.59237'))).toEqual({cantidad:'680.388555'});
 });
 it('refuses both cost kinds at once and empty conversions',()=>{
  expect(()=>resolveEntry({cantidad:'1',costoUnitario:'1',costoTotal:'1'},D('1'))).toThrow();
  expect(()=>resolveEntry({cantidad:'0.000001'},D('0.1'))).toThrow();
  expect(()=>resolveEntry({cantidad:'1'},D('0'))).toThrow();
 });
 it('describes what was typed for the movement note',()=>{
  expect(entryDetail({cantidad:'2',costoUnitario:'20'},'L')).toBe('Ingresado: 2 L × Q20.00');
  expect(entryDetail({cantidad:'2',costoTotal:'40'},'Garrafa 5 galón')).toBe('Ingresado: 2 Garrafa 5 galón, total Q40.00');
  expect(entryDetail({cantidad:'2'},null)).toBeNull();
 });
});
