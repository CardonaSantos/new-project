import {describe,expect,it} from 'vitest';
import {validateWindow,validateCapacity,requireEditable,checkInWindow,noShowWindow,servicePhase} from './reservation.policy.js';
describe('RSV-A booking policy',()=>{
 it('accepts a future interval and rejects reversed/short/long intervals',()=>{
  const now=new Date('2026-10-30T12:00:00Z');
  expect(validateWindow('2026-11-01T18:00:00Z','2026-11-01T19:30:00Z',now).inicio.toISOString())
   .toBe('2026-11-01T18:00:00.000Z');
  expect(()=>validateWindow('2026-11-01T20:00:00Z','2026-11-01T19:00:00Z',now)).toThrow();
  expect(()=>validateWindow('2026-11-01T19:00:00Z','2026-11-01T19:10:00Z',now)).toThrow();
  expect(()=>validateWindow('2026-11-01T08:00:00Z','2026-11-01T21:00:00Z',now)).toThrow();
  expect(()=>validateWindow('2026-10-29T19:00:00Z','2026-10-29T20:00:00Z',now)).toThrow();
 });
 it('requires sufficient real capacity and prevents changes to finalized reservations',()=>{
  expect(()=>validateCapacity([2,2],5)).toThrow('capacidad');
  expect(()=>validateCapacity([2,2],4)).not.toThrow();
  expect(()=>requireEditable('CANCELADA')).toThrow();
  expect(()=>requireEditable('CONFIRMADA')).not.toThrow();
 });
 it('allows check-in only from 30 minutes before start until end',()=>{
  const start=new Date('2026-11-01T18:00:00Z'),end=new Date('2026-11-01T20:00:00Z');
  expect(()=>checkInWindow(start,end,new Date('2026-11-01T17:29:59Z'))).toThrow();
  expect(()=>checkInWindow(start,end,new Date('2026-11-01T17:30:00Z'))).not.toThrow();
  expect(()=>checkInWindow(start,end,new Date('2026-11-01T20:00:00Z'))).toThrow();
 });
 it('returns usable UI status for a checked-in guest without confusing dinner completion',()=>{
  expect(servicePhase('COMPLETADA',true)).toBe('EN_MESA');
  expect(servicePhase('COMPLETADA',false)).toBe('ATENCION_FINALIZADA');
  expect(servicePhase('CONFIRMADA',false)).toBe('CONFIRMADA');
 });
 it('allows no-show only 15 minutes after scheduled arrival',()=>{
  const start=new Date('2026-11-01T18:00:00Z');
  expect(()=>noShowWindow(start,new Date('2026-11-01T18:14:59Z'))).toThrow();
  expect(()=>noShowWindow(start,new Date('2026-11-01T18:15:00Z'))).not.toThrow();
 });
});
