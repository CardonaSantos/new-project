import {describe,it,expect} from 'vitest';
import {closureReadiness} from './closure-readiness.policy.js';
describe('D4 closure policy',()=>{
 it('rejects missing delivery, kitchen and payment',()=>{
  const r=closureReadiness({orderStatus:'ABIERTA',deliveryStatus:'PENDIENTE',lines:[],accounts:[],pendingKitchen:1});
  expect(r.canFinalize).toBe(false);
  expect(r.blockers).toEqual(expect.arrayContaining(['DELIVERY_NOT_COMPLETED','NO_ORDER_LINES','KITCHEN_PENDING','NO_ACCOUNTS']));
 });
 it('recognizes ready and closed states separately',()=>{
  const n=(v:number)=>({gt:(other:number)=>v>other,eq:(other:number)=>v===other});
  const input={orderStatus:'ABIERTA',deliveryStatus:'ENTREGADA',
   lines:[{cantidad:n(1),cantidadEnviada:1}],
   accounts:[{total:n(22),pagado:22}],pendingKitchen:0};
  expect(closureReadiness(input)).toEqual({canFinalize:true,alreadyClosed:false,blockers:[]});
  expect(closureReadiness({...input,orderStatus:'CERRADA'}))
   .toEqual({canFinalize:false,alreadyClosed:true,blockers:[]});
 });
});
