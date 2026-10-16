import {describe,it,expect} from 'vitest';
import {requiresCancellationAuthorization,requireCancellationClassification} from './cancellation.policy.js';
describe('ORD-A cancellation authorization',()=>{
 it('permits ordinary cancellation only before preparation',()=>{
  expect(requiresCancellationAuthorization({consumed:0,prepared:0,delivered:0})).toBe(false);
  expect(requiresCancellationAuthorization({consumed:1,prepared:0,delivered:0})).toBe(true);
  expect(requiresCancellationAuthorization({consumed:0,prepared:1,delivered:0})).toBe(true);
  expect(requiresCancellationAuthorization({consumed:0,prepared:0,delivered:1})).toBe(true);
 });
 it('requires classification for costly cancellation',()=>{
  expect(()=>requireCancellationClassification()).toThrow('clasificacion');
  expect(requireCancellationClassification('MERMA_OPERATIVA')).toBe('MERMA_OPERATIVA');
 });
});
