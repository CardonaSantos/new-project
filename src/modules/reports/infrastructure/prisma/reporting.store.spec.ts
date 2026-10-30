import {describe,it,expect,vi} from 'vitest';
import {ReportingStore} from './reporting.store.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
const admin:Principal={id:'admin',nombre:'Admin',email:'admin@test.dev',sessionId:'sess',versionAutorizacion:1,debeCambiarContrasena:false};
function rig(){
 const tx={
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'s1',nombre:'Principal',codigo:'PRINCIPAL',
   activa:true,zonaHoraria:'America/Guatemala',configuracionSucursalesComoSucursal:{horaCorteOperativo:'04:00',moneda:'GTQ'}})},
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'role'})},
  venta:{aggregate:vi.fn().mockResolvedValue({_sum:{total:'100.00',descuentoTotal:'5.00'},_count:{id:3}}),
   findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  pago:{aggregate:vi.fn().mockResolvedValue({_sum:{monto:'80.00'},_count:{id:2}})},
  reembolsoPago:{aggregate:vi.fn().mockResolvedValue({_sum:{monto:'10.00'},_count:{id:1}})},
  gastoOperativo:{aggregate:vi.fn().mockResolvedValue({_sum:{monto:'20.00'},_count:{id:1}})},
  turnoCaja:{aggregate:vi.fn().mockResolvedValue({_sum:{diferencia:null},_count:{id:0}}),
   count:vi.fn().mockResolvedValue(0)},
  $queryRaw:vi.fn().mockResolvedValueOnce([{total:2}])
   .mockResolvedValueOnce([{dia:'2026-10-30',total:'100.00',descuentos:'5.00',cuentas:3,tickets:2}])
   .mockResolvedValueOnce([{dia:'2026-10-30',total:'80.00'}])
   .mockResolvedValueOnce([{dia:'2026-10-30',total:'10.00'}])
   .mockResolvedValueOnce([{dia:'2026-10-30',total:'20.00'}])
 };
 const db={$transaction:vi.fn(async(fn: (t:unknown)=>Promise<unknown>)=>fn(tx))} as unknown as PrismaService;
 return {tx,store:new ReportingStore(db),db};
}
describe('REP-1 sources and accounting guardrails',()=>{
 it('does not double-count sales as collections or costs',async()=>{
  const {store,tx}=rig();
  const report=await store.overview(admin,{sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30'}) as any;
  expect(report.kpis.ventasNetas).toBe('100.00');
  expect(report.kpis.cobrosBrutos).toBe('80.00');
  expect(report.kpis.reembolsos).toBe('10.00');
  expect(report.kpis.cobrosNetos).toBe('70.00');
  expect(report.kpis.gastosRegistrados).toBe('20.00');
  expect(report.kpis.ticketsUnicos).toBe(2);
  expect(report.kpis.ticketPromedio).toBe('50.00');
  expect(report.kpis.margenBruto).toBe(null);
  expect(report.kpis.diferenciaCajaCerrada).toBe(null);
  expect(report.serieDiaria).toHaveLength(1);
  expect(report.serieDiaria[0].ventasNetas).toBe('100.00');
  expect(tx.pago.aggregate).toHaveBeenCalledOnce();
  expect(tx.venta.aggregate).toHaveBeenCalledOnce();
 });
 it('blocks reporting across branches without reports.read',async()=>{
  const {store,tx}=rig();
  tx.usuarioRol.findFirst.mockResolvedValue(null);
  await expect(store.overview(admin,{sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30'}))
   .rejects.toThrow('Sin permiso reports.read');
  expect(tx.venta.aggregate).not.toHaveBeenCalled();
 });
 it('rejects unbounded ticket listings before accessing the database',async()=>{
  const {store,db}=rig();
  await expect(store.tickets(admin,{sucursalId:'s1',periodo:'DIA',page:1,limit:500}))
   .rejects.toThrow('Paginación');
  expect(db.$transaction).not.toHaveBeenCalled();
 });
});
