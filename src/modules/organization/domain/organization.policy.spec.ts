import {describe,expect,it} from 'vitest';
import {BadRequestException,ConflictException} from '@nestjs/common';
import {branchCode,deviceCode,timezone,currency,cutoff,deviceStationPolicy,requireChanges,name} from './organization.policy.js';

describe('Organization domain policies',()=>{
 it('normaliza códigos y moneda',()=>{
  expect(branchCode(' central_1 ')).toBe('CENTRAL_1');
  expect(deviceCode(' pos-01 ')).toBe('POS-01');
  expect(currency('gtq')).toBe('GTQ');
 });
 it('rechaza códigos, moneda y corte inválidos',()=>{
  expect(()=>branchCode('a')).toThrow(BadRequestException);
  expect(()=>deviceCode(' ? ')).toThrow(BadRequestException);
  expect(()=>currency('G')).toThrow(BadRequestException);
  expect(()=>cutoff('24:01')).toThrow(BadRequestException);
  expect(cutoff('04:00')).toBe('04:00');
 });
 it('comprueba zonas horarias IANA sin depender de la UI',()=>{
  expect(timezone('America/Guatemala')).toBe('America/Guatemala');
  expect(()=>timezone('Ciudad/Mala')).toThrow(BadRequestException);
 });
 it('restringe la asignación de estaciones a KDS',()=>{
  expect(()=>deviceStationPolicy('POS','station-1')).toThrow(ConflictException);
  expect(()=>deviceStationPolicy('KDS','station-1')).not.toThrow();
  expect(()=>deviceStationPolicy('IMPRESORA',null)).not.toThrow();
 });
 it('impide parches sin cambios',()=>{
  expect(()=>requireChanges({})).toThrow(BadRequestException);
  expect(()=>requireChanges({nombre:'Activo'})).not.toThrow();
  expect(()=>name('   ')).toThrow(BadRequestException);
  expect(name('  Norte ')).toBe('Norte');
 });
});
