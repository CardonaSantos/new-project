import {describe,it,expect} from 'vitest';
import {closureReadiness} from './closure-readiness.policy.js';
describe('D4 closure policy',()=>{
 it('rejects missing delivery, kitchen and payment',()=>{
  const r=closureReadiness({orderStatus:'ABIERTA',deliveryStatus:'PENDIENTE',lines:[],accounts:[],pendingKitchen:1});
  expect(r.canFinalize).toBe(false);
  expect(r.blockers).toEqual(expect.arrayContaining(['DELIVERY_NOT_COMPLETED','NO_ORDER_LINES','KITCHEN_PENDING','NO_ACCOUNTS']));
 });
});
