import {describe,it,expect,vi} from 'vitest';
import {runOnce} from './order-shared.js';
import type {Tx} from './order-shared.js';
import type {Principal} from '../../../auth/application/auth.service.js';
const actor:Principal={id:'u1',email:'test@example.com',nombre:'Test',sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
describe('Order command idempotency',()=>{
 it('stores first response and replays it once, protecting different payloads',async()=>{
  const cache=new Map<string,any>();
  const tx={operacionIdempotente:{
   findUnique:vi.fn(async({where}:{where:{clave:string}})=>cache.get(where.clave)??null),
   create:vi.fn(async({data}:{data:any})=>{cache.set(data.clave,data);return data;})
  }} as unknown as Tx;
  const invoke=vi.fn(async()=>({orderId:'123'}));
  expect(await runOnce(tx,actor,'TEST:IDEMP:001','ORDER_CREATE',{cantidad:2},invoke)).toEqual({orderId:'123'});
  expect(await runOnce(tx,actor,'TEST:IDEMP:001','ORDER_CREATE',{cantidad:2},invoke)).toEqual({orderId:'123'});
  expect(invoke).toHaveBeenCalledTimes(1);
  await expect(runOnce(tx,actor,'TEST:IDEMP:001','ORDER_CREATE',{cantidad:3},invoke))
   .rejects.toThrow('Clave idempotente');
 });
 it('does not record failed execution',async()=>{
  const create=vi.fn();
  const tx={operacionIdempotente:{findUnique:vi.fn(async()=>null),create}} as unknown as Tx;
  await expect(runOnce(tx,actor,'TEST:IDEMP:002','ORDER_CREATE',{cantidad:2},async()=>{
   throw Error('stock insuficiente');
  })).rejects.toThrow('stock insuficiente');
  expect(create).not.toHaveBeenCalled();
 });
});
