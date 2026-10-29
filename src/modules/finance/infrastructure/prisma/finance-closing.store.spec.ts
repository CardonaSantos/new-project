import {createHash,randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {FinanceClosingStore} from './finance-closing.store.js';
const actor={id:'u1'} as Principal;
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function setup(openShifts=0,openOrders=0){
 const attempts=new Map<string,any>(),closes:any[]=[],audits:any[]=[];
 const money=new Prisma.Decimal(0);
 const zero={_sum:{monto:money,total:money},_count:{id:0}};
 const shifts=Array.from({length:openShifts},(_,i)=>({
  id:'shift-'+i,cajaId:'cash',cerradaEn:null,fondoInicial:money,
  efectivoEsperado:null,efectivoContado:null,diferencia:null
 }));
 const tx={
  usuarioRol:{findFirst:vi.fn(async()=>({id:'grant'}))},
  sucursal:{findUnique:vi.fn(async()=>({id:'b',activa:true,zonaHoraria:'America/Guatemala',
   configuracionSucursalesComoSucursal:{horaCorteOperativo:'04:00'}}))},
  cierreOperativo:{
   findUnique:vi.fn(async({where}:any)=>closes.find(c=>
    c.sucursalId===where.sucursalId_fechaOperativa.sucursalId&&
    c.fechaOperativa.getTime()===where.sucursalId_fechaOperativa.fechaOperativa.getTime())??null),
   create:vi.fn(async({data}:any)=>{
    const row={id:'closing-'+(closes.length+1),cerradoEn:new Date(),...data};closes.push(row);return row;
   })
  },
  turnoCaja:{findMany:vi.fn(async()=>shifts)},
  orden:{count:vi.fn(async()=>openOrders)},
  pago:{aggregate:vi.fn(async()=>zero)},
  reembolsoPago:{aggregate:vi.fn(async()=>zero)},
  pagoProveedor:{aggregate:vi.fn(async()=>zero)},
  gastoOperativo:{aggregate:vi.fn(async()=>zero)},
  venta:{aggregate:vi.fn(async()=>zero)},
  movimientoCaja:{groupBy:vi.fn(async()=>[])},
  movimientoFinanciero:{aggregate:vi.fn(async()=>zero)},
  operacionIdempotente:{
   findUnique:vi.fn(async({where}:any)=>attempts.get(where.clave)??null),
   update:vi.fn(async({where,data}:any)=>{Object.assign(attempts.get(where.clave),data);return data;})
  },
  eventoAuditoria:{create:vi.fn(async({data}:any)=>{audits.push(data);return data;})},
  eventoOutbox:{create:vi.fn(async()=>({}))}
 };
 const db={$transaction:vi.fn(async(fn:(tx:any)=>Promise<unknown>)=>fn(tx))};
 const issue=()=>{
  const id='FIN:'+randomUUID(),accion='FIN_DAY_CLOSE';
  attempts.set(id,{operacion:accion,hashSolicitud:hash({usuarioId:actor.id,
   sucursalId:'b',accion}),finalizada:false,expiraEn:new Date(Date.now()+86400000)});
  return id;
 };
 return {store:new FinanceClosingStore(db as unknown as PrismaService),issue,closes,audits,tx};
}
describe('FIN-A operational closing transaction',()=>{
 it('previews an older branch day and freezes one immutable snapshot',async()=>{
  const f=setup(),day='2026-10-10';
  const preview=await f.store.preview(actor,{sucursalId:'b',fechaOperativa:day}) as any;
  expect(preview.cerrado).toBe(false);
  expect(preview.resumen.puedeCerrar).toBe(true);
  expect(preview.resumen.libroFinanciero.netoFirmado).toBe('0.00');
  expect(preview.resumen.periodoUtc.desde).toBe('2026-10-10T10:00:00.000Z');
  const input={sucursalId:'b',fechaOperativa:day,operationId:f.issue()};
  const first=await f.store.confirm(actor,input),second=await f.store.confirm(actor,input);
  expect(first).toEqual(second);
  expect(f.closes).toHaveLength(1);
  expect(f.audits).toHaveLength(1);
  const saved=await f.store.detail(actor,'b',day) as any;
  expect(saved.id).toBe(f.closes[0].id);
  const after=await f.store.preview(actor,{sucursalId:'b',fechaOperativa:day}) as any;
  expect(after.cerrado).toBe(true);
  await expect(f.store.confirm(actor,{...input,operationId:f.issue()}))
   .rejects.toThrow('ya está cerrado');
 });
 it('denies a revoked user request before any persisted closing snapshot',async()=>{
  const f=setup();
  f.tx.usuarioRol.findFirst.mockResolvedValue(null);
  await expect(f.store.confirm(actor,{sucursalId:'b',fechaOperativa:'2026-10-10',
   operationId:f.issue()})).rejects.toThrow('Permiso de cierre insuficiente');
  expect(f.closes).toHaveLength(0);
 });
 it('blocks closing a day with an open cash shift or open order',async()=>{
  for(const mode of [1,2]){
   const f=setup(mode===1?1:0,mode===2?1:0);
   const input={sucursalId:'b',fechaOperativa:'2026-10-10',operationId:f.issue()};
   const view=await f.store.preview(actor,input) as any;
   expect(view.resumen.puedeCerrar).toBe(false);
   await expect(f.store.confirm(actor,input)).rejects.toThrow();
   expect(f.closes).toHaveLength(0);
  }
 });
});
