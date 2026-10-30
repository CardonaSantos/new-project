import {describe,expect,it,vi} from 'vitest';
import type {Prisma} from '../../../../generated/prisma/client.js';
import {financialBranchRollup} from './branch-rollup.js';
const day=(id:string,moneda:string)=>({
 id,nombre:id,moneda,desde:'2026-10-01',hasta:'2026-10-30',
 zonaHoraria:'America/Guatemala',corte:'04:00',
 from:new Date('2026-10-01T10:00:00Z'),to:new Date('2026-10-31T10:00:00Z')
});
describe('REP-A R6 multi-branch rollup',()=>{
 it('separates ledgers and currencies without disclosing other branches',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([
   {sucursalId:'s1',ventas:1,ingresos:'22.00',pagos:4,cobrado:'88',
    reembolsos:1,reembolsado:'5',liquidaciones:1,comisiones:'2',netoLiquidado:'20'},
   {sucursalId:'s2',ventas:2,ingresos:'50',pagos:2,cobrado:'50',
    reembolsos:0,reembolsado:'0',liquidaciones:0,comisiones:'0',netoLiquidado:'0'},
   {sucursalId:'s3',ventas:1,ingresos:'100',pagos:1,cobrado:'100',
    reembolsos:0,reembolsado:'0',liquidaciones:0,comisiones:'0',netoLiquidado:'0'}
  ])};
  const r=await financialBranchRollup(tx as unknown as Prisma.TransactionClient,
   [day('s1','GTQ'),day('s2','GTQ'),day('s3','USD')]);
  expect(r.data).toHaveLength(3);
  expect(r.data[0]).toMatchObject({ingresos:'22.00',cobrado:'88.00',
   diferenciaCobrosVsVentas:'66.00'});
  expect(r.totalesPorMoneda).toEqual([
   {currency:'GTQ',ventas:3,ingresos:'72.00',pagos:6,cobrado:'138.00',
    reembolsos:1,reembolsado:'5.00',liquidaciones:1,comisiones:'2.00',
    netoLiquidado:'20.00',diferenciaCobrosVsVentas:'66.00'},
   {currency:'USD',ventas:1,ingresos:'100.00',pagos:1,cobrado:'100.00',
    reembolsos:0,reembolsado:'0.00',liquidaciones:0,comisiones:'0.00',
    netoLiquidado:'0.00',diferenciaCobrosVsVentas:'0.00'}
  ]);
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
 });
 it('does not touch database with zero authorized branches',async()=>{
  const tx={$queryRaw:vi.fn()};
  expect(await financialBranchRollup(tx as unknown as Prisma.TransactionClient,[]))
   .toEqual({data:[],totalesPorMoneda:[]});
  expect(tx.$queryRaw).not.toHaveBeenCalled();
 });
});
