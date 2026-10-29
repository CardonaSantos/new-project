import {describe,expect,it,vi} from 'vitest';
import {CustomersStore} from './customers.store.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
const actor={id:'employee',email:'e@example.test',nombre:'Employee',sessionId:'s',
 debeCambiarContrasena:false,versionAutorizacion:1};
describe('Customer privacy enforcement',()=>{
 it('combines branch scope with search as AND, preventing OR search bypass',async()=>{
  const findMany=vi.fn().mockResolvedValue([]);
  const count=vi.fn().mockResolvedValue(0);
  const tx={usuarioRol:{findFirst:vi.fn(async({where}:any)=>
    where.OR?.[0]?.rol?.rolPermisosComoRol?.some?.permiso?.codigo==='customers.global.manage'
    ?null:{id:'assigned'})},
   sucursal:{findUnique:vi.fn().mockResolvedValue({id:'branch-a',activa:true})},
   cliente:{findMany,count}};
  const store=new CustomersStore({$transaction:vi.fn(async fn=>fn(tx))} as unknown as PrismaService);
  await store.list(actor,{sucursalId:'branch-a',search:'very private',page:1,limit:20});
  const where=findMany.mock.calls[0][0].where;
  expect(where.AND).toHaveLength(2);
  expect(where.AND[0].OR).toHaveLength(4);
  expect(where.AND[1].OR).toHaveLength(3);
  expect(where.AND[0].OR[0].clienteSucursalesComoCliente.some.sucursalId).toBe('branch-a');
 });
 it('rejects cross-branch customer selection without revealing client identity',async()=>{
  const tx={usuarioRol:{findFirst:vi.fn().mockResolvedValue(null)}};
  const store=new CustomersStore({$transaction:vi.fn(async fn=>fn(tx))} as unknown as PrismaService);
  await expect(store.assertSelectable('employee','branch-b','customer-from-other-branch'))
   .rejects.toThrow('Permiso insuficiente');
 });
});
