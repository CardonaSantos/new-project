import {describe,expect,it,vi} from 'vitest';
import {FinanceStore} from './finance.store.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {CashStore} from '../../../payments/infrastructure/prisma/cash.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
const actor:Principal={id:'admin',email:'admin@example.test',nombre:'Admin',sessionId:'s',
 versionAutorizacion:1,debeCambiarContrasena:false};
describe('FIN-A must never repost platform gross after DEL-A D3 reconciliation',()=>{
 it('excludes platform gross from pending external bank receipts',async()=>{
  const tx={usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'role'})},
   pago:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)}};
  const db={$transaction:vi.fn(async fn=>fn(tx))} as unknown as PrismaService;
  const store=new FinanceStore(db,{} as CashStore);
  await store.pendingExternal(actor,{sucursalId:'branch-1',sourceType:'PAGO',page:1,limit:20});
  const where=tx.pago.findMany.mock.calls[0][0].where;
  expect(where.OR).toEqual([
   {referencia:null},{referencia:{not:{startsWith:'PLATFORM_SETTLEMENT:'}}}
  ]);
  expect(where.cuenta.orden.sucursalId).toBe('branch-1');
 });
 it('rejects manually posting a second gross payment via FIN-A',async()=>{
  const tx={usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'role'})},
   pago:{findUnique:vi.fn().mockResolvedValue({
    id:'p1',metodo:'OTRO',recibidoPorRepartidor:false,
    referencia:'PLATFORM_SETTLEMENT:l1',
    cuenta:{orden:{sucursalId:'branch-1'}}
   })},movimientoFinanciero:{create:vi.fn()}};
  const db={$transaction:vi.fn(async fn=>fn(tx))} as unknown as PrismaService;
  const store=new FinanceStore(db,{} as CashStore);
  vi.spyOn(store as any,'completeIntent').mockImplementation(
   async(_tx,_u,_d,_op,fn:()=>Promise<unknown>)=>fn());
  vi.spyOn(store as any,'activeBranch').mockResolvedValue({});
  await expect(store.postExternal(actor,{
   sucursalId:'branch-1',operationId:'FIN:intent',sourceType:'PAGO',
   sourceId:'p1',cuentaFinancieraId:'bank-1'
  })).rejects.toThrow('bruto de plataforma');
  expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
 });
});
