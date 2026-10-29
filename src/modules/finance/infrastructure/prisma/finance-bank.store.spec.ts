import {createHash,randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {FinanceBankStore} from './finance-bank.store.js';
const actor={id:'u1'} as Principal;
const checksum=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function setup(){
 const attempts=new Map<string,any>(),lines:any[]=[],reverses:any[]=[],events:any[]=[],logs:any[]=[];
 const movements:any[]=[
  {id:'payment-1',cuentaId:'bank-1',monto:new Prisma.Decimal('1.00'),referenciaTipo:'PAGO',referenciaId:'p-1'},
  {id:'expense-1',cuentaId:'bank-1',monto:new Prisma.Decimal('-2.00'),referenciaTipo:'GASTO_OPERATIVO',referenciaId:'e-1'}
 ];
 const dbTx={
  usuarioRol:{findFirst:vi.fn(async()=>({id:'grant'}))},
  sucursal:{findUnique:vi.fn(async()=>({activa:true,zonaHoraria:'America/Guatemala',
   configuracionSucursalesComoSucursal:{moneda:'GTQ',horaCorteOperativo:'04:00'}}))},
  cuentaFinanciera:{findUnique:vi.fn(async()=>({id:'bank-1',sucursalId:'b',activa:true,moneda:'GTQ'}))},
  operacionIdempotente:{
   findUnique:vi.fn(async({where}:any)=>attempts.get(where.clave)??null),
   update:vi.fn(async({where,data}:any)=>{const row=attempts.get(where.clave);Object.assign(row,data);return row;})
  },
  lineaExtractoBancario:{
   count:vi.fn(async({where}:any)=>lines.filter(r=>
    where.movimientoFinancieroId?r.movimientoFinancieroId===where.movimientoFinancieroId:
    where.cuentaFinancieraId===r.cuentaFinancieraId&&
    where.claveExterna.in.includes(r.claveExterna)).length),
   create:vi.fn(async({data}:any)=>{
    const row={id:'line-'+(lines.length+1),movimientoFinancieroId:null,
     conciliadoPorId:null,conciliadoEn:null,...data};lines.push(row);return row;
   }),
   findUnique:vi.fn(async({where}:any)=>lines.find(r=>r.id===where.id)??null),
   update:vi.fn(async({where,data}:any)=>{
    const row=lines.find(r=>r.id===where.id);Object.assign(row,data);return row;
   })
  },
  movimientoFinanciero:{
   findUnique:vi.fn(async({where}:any)=>movements.find(x=>x.id===where.id)??null),
   create:vi.fn(async({data}:any)=>{
    const row={id:'reversed-'+movements.length,...data};movements.push(row);return row;
   })
  },
  reversaFinanciera:{
   findUnique:vi.fn(async({where}:any)=>reverses.find(x=>x.movimientoOriginalId===where.movimientoOriginalId)??null),
   create:vi.fn(async({data}:any)=>{
    const row={id:'reversa-'+(reverses.length+1),...data};reverses.push(row);return row;
   })
  },
  cierreOperativo:{findUnique:vi.fn(async()=>null)},
  eventoAuditoria:{create:vi.fn(async({data}:any)=>{events.push(data);return data;})},
  eventoOutbox:{create:vi.fn(async({data}:any)=>{logs.push(data);return data;})}
 };
 const db={$transaction:vi.fn(async (fn:(tx:any)=>Promise<any>)=>fn(dbTx))};
 const store=new FinanceBankStore(db as unknown as PrismaService);
 const issue=(accion:string)=>{
  const operationId='FIN:'+randomUUID();
  attempts.set(operationId,{operacion:accion,hashSolicitud:checksum({
   usuarioId:actor.id,sucursalId:'b',accion}),finalizada:false,
   expiraEn:new Date(Date.now()+86400000)});
  return operationId;
 };
 return {store,issue,dbTx,lines,reverses,movements,events,logs};
}
describe('FIN-A bank transactions: import, reconciliation and corrections',()=>{
 it('imports signed lines once and retries idempotently',async()=>{
  const f=setup(),d={operationId:f.issue('FIN_STATEMENT_IMPORT'),sucursalId:'b',
   cuentaFinancieraId:'bank-1',lineas:[{claveExterna:'bank-log-1',fecha:'2026-10-29',monto:'1.00'}]};
  const a=await f.store.importLines(actor,d),b=await f.store.importLines(actor,d);
  expect(a).toEqual(b);expect(a.importadas).toBe(1);expect(f.lines).toHaveLength(1);
  await expect(f.store.importLines(actor,{...d,lineas:[{...d.lineas[0],monto:'2.00'}]}))
   .rejects.toThrow('datos distintos');
  expect(f.events).toHaveLength(1);
 });
 it('blocks amount mismatch and retains one-to-one match with audited unmatch',async()=>{
  const f=setup();
  await f.store.importLines(actor,{operationId:f.issue('FIN_STATEMENT_IMPORT'),sucursalId:'b',
   cuentaFinancieraId:'bank-1',lineas:[{claveExterna:'bank-log-1',fecha:'2026-10-29',monto:'1.00'}]});
  const wrong={operationId:f.issue('FIN_STATEMENT_MATCH'),sucursalId:'b',
   lineaId:'line-1',movimientoId:'expense-1'};
  await expect(f.store.match(actor,wrong)).rejects.toThrow('Importes');
  expect(f.lines[0].movimientoFinancieroId).toBeNull();
  const d={...wrong,operationId:f.issue('FIN_STATEMENT_MATCH'),movimientoId:'payment-1'};
  expect((await f.store.match(actor,d)).estado).toBe('CONCILIADO');
  expect((await f.store.match(actor,d)).movimientoId).toBe('payment-1');
  expect(f.lines[0].movimientoFinancieroId).toBe('payment-1');
  await expect(f.store.match(actor,{...d,operationId:f.issue('FIN_STATEMENT_MATCH')}))
   .rejects.toThrow('ya conciliada');
  const und={operationId:f.issue('FIN_STATEMENT_UNMATCH'),sucursalId:'b',
   lineaId:'line-1',motivo:'Cruce equivocado de referencia bancaria'};
  expect((await f.store.unmatch(actor,und)).estado).toBe('PENDIENTE');
  expect(f.lines[0].movimientoFinancieroId).toBeNull();
  expect(f.events.some(e=>e.accion==='FIN_STATEMENT_UNMATCHED')).toBe(true);
 });
 it('does not permit direct PAY-A reversals and records a single signed expense reversal',async()=>{
  const f=setup();
  const wrong={operationId:f.issue('FIN_LEDGER_REVERSE'),sucursalId:'b',
   movimientoId:'payment-1',motivo:'Devolución de prueba a cliente'};
  await expect(f.store.reverse(actor,wrong)).rejects.toThrow('módulo de origen');
  const d={operationId:f.issue('FIN_LEDGER_REVERSE'),sucursalId:'b',
   movimientoId:'expense-1',motivo:'Gasto bancario declarado por duplicado'};
  const a=await f.store.reverse(actor,d),b=await f.store.reverse(actor,d);
  expect(a).toEqual(b);expect(a.monto).toBe('2.00');
  expect(f.movements).toHaveLength(3);
  expect(f.reverses).toHaveLength(1);
  expect(f.movements[2].referenciaId).toBe('expense-1');
  expect(f.events.some(e=>e.accion==='FIN_LEDGER_REVERSED')).toBe(true);
  await expect(f.store.reverse(actor,{...d,operationId:f.issue('FIN_LEDGER_REVERSE')}))
   .rejects.toThrow('ya tiene una reversa');
 });
});
