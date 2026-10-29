import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {operationalDate} from '../../domain/payment.policy.js';
import {CashStore} from './cash.store.js';
const actor={id:'cashier-1'} as Principal;
function context(){
 const branch={id:'branch',activa:true,zonaHoraria:'America/Guatemala',
  configuracionSucursalesComoSucursal:{horaCorteOperativo:'04:00',moneda:'GTQ'}};
 const register={id:'register-1',sucursalId:'branch',activa:true,sucursal:branch};
 const shift={id:'shift-1',cajeroId:actor.id,fechaOperativa:
  operationalDate(new Date(),branch.zonaHoraria,branch.configuracionSucursalesComoSucursal.horaCorteOperativo),
  cerradaEn:null,caja:register,fondoInicial:new Prisma.Decimal('15.00')};
 const tx={
  usuarioRol:{findFirst:vi.fn(async()=>({id:'role'}))},
  caja:{findUnique:vi.fn(async()=>register)},
  turnoCaja:{
   findFirst:vi.fn(async()=>null),
   create:vi.fn(async({data}:any)=>({id:'new-shift',...data})),
   findUnique:vi.fn(async()=>shift)
  },
  cierreOperativo:{findUnique:vi.fn(async()=>({id:'closed-day'}))},
  operacionIdempotente:{findUnique:vi.fn(async()=>null),create:vi.fn(async()=>({}))},
  eventoAuditoria:{create:vi.fn(async()=>({}))},
  eventoOutbox:{create:vi.fn(async()=>({}))}
 };
 const db={$transaction:vi.fn(async (fn:(tx:any)=>Promise<any>)=>fn(tx))};
 return {store:new CashStore(db as unknown as PrismaService),tx,shift};
}
describe('Cash mutations respect finalized operational day',()=>{
 it('refuses a new shift after the day has closed without inserting it',async()=>{
  const f=context();
  await expect(f.store.open(actor,{cajaId:'register-1',fondoInicial:'15',
   claveOperacion:'cash-after-close-0001'})).rejects.toThrow('Día operativo cerrado');
  expect(f.tx.turnoCaja.create).not.toHaveBeenCalled();
 });
 it('refuses cash movement helper after closed day but permits old shift closing',async()=>{
  const f=context();
  await expect(f.store.shiftTx(f.tx as never,actor,'shift-1','payments.collect'))
   .rejects.toThrow('Día operativo cerrado');
  expect((await f.store.shiftTx(f.tx as never,actor,'shift-1','cash.close',false,true)).id)
   .toBe('shift-1');
 });
});
