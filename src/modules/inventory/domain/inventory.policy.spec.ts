import {describe,it,expect} from 'vitest';
import {BadRequestException,ConflictException} from '@nestjs/common';
import {code,requiredName,positiveDecimal,nonNegativeDecimal,expirationRule,sameDimension,requireChange} from './inventory.policy.js';
describe('Inventory policies',()=>{
 it('normaliza y valida códigos y nombres',()=>{
  expect(code(' cafe_01 ')).toBe('CAFE_01');
  expect(requiredName(' Leche ')).toBe('Leche');
  expect(()=>requiredName('   ')).toThrow(BadRequestException);
  expect(()=>code('$')).toThrow(BadRequestException);
 });
 it('mantiene precisión decimal y no admite cantidades negativas o cero',()=>{
  expect(positiveDecimal('0.000001')).toBe('0.000001');
  expect(()=>positiveDecimal('0')).toThrow(BadRequestException);
  expect(()=>positiveDecimal('-3')).toThrow(BadRequestException);
  expect(()=>positiveDecimal('1.0000001')).toThrow(BadRequestException);
  expect(nonNegativeDecimal('0')).toBe('0');
 });
 it('exige lote para vencimiento y rechaza dimensiones incompatibles',()=>{
  expect(()=>expirationRule(false,true)).toThrow(ConflictException);
  expect(()=>expirationRule(true,true)).not.toThrow();
  expect(()=>sameDimension('MASA','VOLUMEN')).toThrow(ConflictException);
 });
 it('evita actualizar documentos con patches vacíos',()=>{
  expect(()=>requireChange({})).toThrow(BadRequestException);
 });
});
