import {describe,expect,it} from 'vitest';
import {compareBankMatchEvidence,localBankDay} from './bank-match.policy.js';
const correct={bankReference:'AUTH-123',originReferences:['AUTH-123','OTHER'],
 bankDay:'2026-10-30',originDay:'2026-10-29'};
describe('bank matching domain evidence',()=>{
 it('accepts matching reference within two weeks of source',()=>{
  expect(compareBankMatchEvidence(correct)).toEqual([]);
  expect(compareBankMatchEvidence({...correct,bankReference:' auth-123 '})).toEqual([]);
 });
 it('requires supervised reconciliation for mismatched/absent references and aged settlement',()=>{
  expect(compareBankMatchEvidence({...correct,bankReference:'WRONG'})).toContain(
   'Referencia bancaria no coincide con la fuente verificada');
  expect(compareBankMatchEvidence({...correct,bankReference:null})).toHaveLength(1);
  expect(compareBankMatchEvidence({...correct,bankDay:'2026-11-20'})).toContain(
   'Fecha bancaria fuera de ventana de compensación (0 a 14 días)');
  expect(compareBankMatchEvidence({...correct,bankDay:'2026-10-28'})).toHaveLength(1);
 });
 it('converts source timestamp to branch-local calendar day',()=>{
  expect(localBankDay(new Date('2026-10-30T02:00:00Z'),'America/Guatemala'))
   .toBe('2026-10-29');
 });
});
