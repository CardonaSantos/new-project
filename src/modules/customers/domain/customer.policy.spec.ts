import {describe,expect,it} from 'vitest';
import {coordinate,normalizeCustomerName,cleanOptional} from './customer.policy.js';
describe('Customers domain policy',()=>{
 it('normalizes names without changing identity',()=>{
  expect(normalizeCustomerName('  Ana   Pérez  ')).toBe('Ana Pérez');
  expect(()=>normalizeCustomerName(' ')).toThrow();
 });
 it('validates geographic bounds as precise strings, not JS floats',()=>{
  expect(coordinate('90.0000000','latitud')).toBe('90.0000000');
  expect(coordinate('-180.0000000','longitud')).toBe('-180.0000000');
  expect(()=>coordinate('90.0000001','latitud')).toThrow();
  expect(()=>coordinate('180.0000001','longitud')).toThrow();
  expect(()=>coordinate('13.12345678','latitud')).toThrow();
  expect(()=>coordinate('1e2','latitud')).toThrow();
  expect(coordinate(null,'longitud')).toBeNull();
 });
 it('cleans optional values',()=>expect(cleanOptional('   ')).toBeNull());
});
