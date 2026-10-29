import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {postVerifiedExternalMovement,type FinancialTx} from './finance-posting.js';
const dec=(s:string)=>new Prisma.Decimal(s);
function setup(){
 let existing:any=null;
 const tx={
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'branch',activa:true,
   zonaHoraria:'America/Guatemala',configuracionSucursalesComoSucursal:{moneda:'GTQ'}})},
  cierreOperativo:{findUnique:vi.fn().mockResolvedValue(null)},
  cuentaFinanciera:{findUnique:vi.fn().mockResolvedValue({id:'bank',sucursalId:'branch',
   activa:true,moneda:'GTQ',tipo:'BANCO'})},
  movimientoFinanciero:{
   findFirst:vi.fn().mockImplementation(async({where}:any)=>existing?.referenciaId===where.referenciaId&&existing?.referenciaTipo===where.referenciaTipo?existing:null),
   create:vi.fn().mockImplementation(async({data}:any)=>{
    existing={id:'entry-1',...data};return existing;
   })
  }
 };
 return {tx,post:(override:Record<string,unknown>={})=>postVerifiedExternalMovement(tx as unknown as FinancialTx,{
  sucursalId:'branch',cuentaId:'bank',referenciaTipo:'PAGO',
  referenciaId:'pay-1',monto:dec('85.00'),descripcion:'Pago externo',...override
 })};
}
describe('FIN-A unique external journal posting',()=>{
 it('posts a confirmed-source movement once and repeats idempotently',async()=>{
  const f=setup();
  const a=await f.post(),b=await f.post();
  expect(a).toEqual({id:'entry-1',created:true,cuentaId:'bank',monto:'85.00'});
  expect(b).toEqual({...a,created:false});
  expect(f.tx.movimientoFinanciero.create).toHaveBeenCalledOnce();
 });
 it('does not allow a source to migrate to another bank or amount',async()=>{
  const f=setup();await f.post();
  await expect(f.post({cuentaId:'different'})).rejects.toThrow('cuenta o importe distinto');
  await expect(f.post({monto:dec('86.00')})).rejects.toThrow('importe distinto');
 });
 it('does not post to another branch or inactive financial account',async()=>{
  const f=setup();
  f.tx.cuentaFinanciera.findUnique.mockResolvedValueOnce({
   id:'bank',sucursalId:'branch-other',activa:true,moneda:'GTQ',tipo:'BANCO'});
  await expect(f.post()).rejects.toThrow('no disponible');
  expect(f.tx.movimientoFinanciero.create).not.toHaveBeenCalled();
 });
 it('prevents recording a customer receipt as corporate card credit',async()=>{
  const f=setup();
  f.tx.cuentaFinanciera.findUnique.mockResolvedValueOnce({
   id:'bank',sucursalId:'branch',activa:true,moneda:'GTQ',tipo:'TARJETA_EMPRESA'});
  await expect(f.post()).rejects.toThrow('no admite cobros');
 });
 it('rejects new postings after the daily financial close but preserves old retries',async()=>{
  const f=setup();
  const first=await f.post();
  f.tx.cierreOperativo.findUnique.mockResolvedValue({id:'closed'});
  const replay=await f.post();
  expect(replay.id).toBe(first.id);
  await expect(f.post({referenciaId:'pay-2'}))
   .rejects.toThrow('Día operativo cerrado');
  expect(f.tx.movimientoFinanciero.create).toHaveBeenCalledOnce();
 });
 it('never writes a zero-value financial movement',async()=>{
  const f=setup();
  await expect(f.post({monto:dec('0.00')})).rejects.toThrow('no puede ser cero');
 });
});
