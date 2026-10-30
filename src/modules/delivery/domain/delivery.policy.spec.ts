import {describe,it,expect} from 'vitest';
import {transition,snapshotAddress} from './delivery.policy.js';

describe('DEL-A D2 domain transitions',()=>{
 it('moves directly through dispatch and completion',()=>{
  expect(()=>transition('PENDIENTE','EN_REPARTO')).not.toThrow();
  expect(()=>transition('EN_REPARTO','ENTREGADA')).not.toThrow();
 });
 it.each(['PENDIENTE','EN_REPARTO'] as const)('permits cancellation from %s',state=>{
  expect(()=>transition(state,'CANCELADA')).not.toThrow();
 });
 it.each([
  ['PENDIENTE','ENTREGADA'],['ENTREGADA','CANCELADA'],
  ['CANCELADA','PENDIENTE'],['EN_REPARTO','PENDIENTE'],
  ['ENTREGADA','EN_REPARTO'],['PENDIENTE','PENDIENTE']
 ] as const)('blocks invalid transition %s -> %s',(a,b)=>{
  expect(()=>transition(a,b)).toThrow('Transición de entrega no permitida');
 });
 it('normalizes a delivery destination snapshot',()=>{
  expect(snapshotAddress('  Calle  5,   Zona 1  ')).toBe('Calle 5, Zona 1');
  expect(()=>snapshotAddress('x')).toThrow();
 });
});
