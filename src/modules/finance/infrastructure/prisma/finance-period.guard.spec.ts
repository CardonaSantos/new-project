import {describe,expect,it,vi} from 'vitest';
import {assertFinancialPeriodOpen} from './finance-period.guard.js';
const branch={id:'b',zonaHoraria:'America/Guatemala',
 configuracionSucursalesComoSucursal:{horaCorteOperativo:'04:00'}};
describe('transversal financial close guard',()=>{
 it('uses local 04:00 cut and blocks a closed prior operational date',async()=>{
  const now=new Date('2026-10-29T09:59:59.000Z');
  const findUnique=vi.fn(async()=>({id:'closed-28'}));
  await expect(assertFinancialPeriodOpen({cierreOperativo:{findUnique}} as never,branch,now))
   .rejects.toThrow('Día operativo cerrado');
  expect(findUnique).toHaveBeenCalledWith({where:{sucursalId_fechaOperativa:{
   sucursalId:'b',fechaOperativa:new Date('2026-10-28T00:00:00.000Z')
  }}});
 });
 it('accepts next operating day when no daily close exists',async()=>{
  const findUnique=vi.fn(async()=>null);
  const date=await assertFinancialPeriodOpen({cierreOperativo:{findUnique}} as never,
   branch,new Date('2026-10-29T10:00:00.000Z'));
  expect(date.toISOString()).toBe('2026-10-29T00:00:00.000Z');
 });
});
