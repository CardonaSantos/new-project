import {describe,it,expect} from 'vitest';
import {BadRequestException,ConflictException} from '@nestjs/common';
import {catalogCode,catalogName,decimalPrice,bounds,period,validSchedule,requireInventoryLink,hourAt} from './catalog.policy.js';
describe('CAT-A commercial invariants',()=>{
 it('normalizes codes, names, price precision',()=>{
  expect(catalogCode('cap-gra')).toBe('CAP-GRA');
  expect(catalogName(' Capuchino ')).toBe('Capuchino');
  expect(decimalPrice('28.50')).toBe('28.50');
  expect(()=>decimalPrice('28.500')).toThrow(BadRequestException);
  expect(()=>catalogName('  ')).toThrow(BadRequestException);
 });
 it('rejects invalid modifier selections and date ranges',()=>{
  expect(()=>bounds(3,2)).toThrow(ConflictException);
  expect(()=>period(new Date('2026-01-02'),new Date('2026-01-01'))).toThrow(BadRequestException);
  expect(()=>validSchedule(1,'18:00','06:00')).toThrow(BadRequestException);
 });
 it('requires inventory link only for stock products',()=>{
  expect(()=>requireInventoryLink('INVENTARIABLE',null)).toThrow(ConflictException);
  expect(()=>requireInventoryLink('PREPARADO','x')).toThrow(ConflictException);
 });
 it('resolves branch local time',()=>{
  expect(hourAt(new Date('2026-10-15T18:30:00Z'),'America/Guatemala'))
   .toEqual({day:4,time:'12:30'});
 });
});
