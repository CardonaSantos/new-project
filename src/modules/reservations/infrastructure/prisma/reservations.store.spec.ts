import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {ReservationsStore} from './reservations.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
const u:Principal={id:'manager',nombre:'Manager',email:'manager@dev.test',
 sessionId:'s',versionAutorizacion:1,debeCambiarContrasena:false};
const next=(min:number)=>new Date(Date.now()+min*60000).toISOString();
function rig(){
 const r={id:'res-1',sucursalId:'branch',estado:'CONFIRMADA',
  inicio:new Date(next(15)),fin:new Date(next(105)),personas:2};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:'table-1'}]),
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'role'})},
  sucursal:{findUnique:vi.fn().mockResolvedValue({activa:true})},
  cliente:{findFirst:vi.fn().mockResolvedValue({id:'customer'})},
  operacionIdempotente:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn()},
  reserva:{findUnique:vi.fn().mockResolvedValue(r),findMany:vi.fn().mockResolvedValue([]),
   count:vi.fn().mockResolvedValue(0),create:vi.fn().mockResolvedValue(r),
   update:vi.fn(async({data}:any)=>{Object.assign(r,data);return r;})},
  reservaMesa:{findMany:vi.fn().mockResolvedValue([{mesaId:'table-1'}]),
   deleteMany:vi.fn(),createMany:vi.fn()},
  mesa:{findMany:vi.fn().mockResolvedValue([{id:'table-1',capacidad:4}]),
   count:vi.fn().mockResolvedValue(1)},
  ocupacionMesa:{count:vi.fn().mockResolvedValue(0),findMany:vi.fn().mockResolvedValue([]),
   createMany:vi.fn().mockResolvedValue({count:1})},
  eventoReserva:{create:vi.fn()},
  eventoAuditoria:{create:vi.fn()},
  eventoOutbox:{create:vi.fn()}
 };
 const db={$transaction:vi.fn(async work=>work(tx))} as unknown as PrismaService;
 const store=new ReservationsStore(db);
 vi.spyOn(store,'detail').mockResolvedValue({id:r.id,estado:r.estado} as never);
 return {store,tx,r,db};
}
describe('RSV-A serializable reservation invariants',()=>{
 it('denies reservation detail to a user without branch access',async()=>{
  const {store,tx}=rig();
  tx.usuarioRol.findFirst.mockResolvedValue(null);
  await expect(store.list(u,{sucursalId:'branch',page:1,limit:20})).rejects.toThrow('Sin permiso');
 });
 it('locks a table and blocks a conflicting reservation before insertion',async()=>{
  const {store,tx}=rig();
  const d={sucursalId:'branch',nombreContacto:'Cliente de prueba',personas:2,
   inicio:next(15),fin:next(105),mesaIds:['table-1'],claveOperacion:'RSV:LOCK:001'};
  await expect(store.create(u,d)).rejects.toThrow('ya están reservadas');
  expect(tx.$queryRaw).toHaveBeenCalledOnce();
  expect(tx.reserva.create).not.toHaveBeenCalled();
 });
 it('rejects cross-branch tables, even with a valid role',async()=>{
  const {store,tx}=rig();
  tx.mesa.findMany.mockResolvedValue([]);
  const d={sucursalId:'branch',nombreContacto:'Cliente de prueba',personas:2,
   inicio:next(15),fin:next(105),mesaIds:['foreign-table'],claveOperacion:'RSV:BRANCH:001'};
  await expect(store.create(u,d)).rejects.toThrow('ajena');
  expect(tx.reserva.create).not.toHaveBeenCalled();
 });
 it('forbids cancel or check-in of an already cancelled reservation',async()=>{
  const {store,r,tx}=rig();r.estado='CANCELADA';
  await expect(store.cancel(u,r.id,{motivo:'Cliente canceló'})).resolves.toMatchObject({id:r.id});
  await expect(store.checkIn(u,r.id)).rejects.toThrow('confirmada');
  expect(tx.ocupacionMesa.createMany).not.toHaveBeenCalled();
 });
 it('creates one physical table occupation and audit event at check-in',async()=>{
  const {store,r,tx}=rig();
  await store.checkIn(u,r.id);
  expect(tx.ocupacionMesa.createMany).toHaveBeenCalledWith({data:[{
   mesaId:'table-1',reservaId:r.id,abiertaPorId:u.id
  }]});
  expect(r.estado).toEqual('COMPLETADA');
  expect(tx.eventoReserva.create).toHaveBeenCalledOnce();
  expect(tx.eventoOutbox.create).toHaveBeenCalledTimes(2);
 });
 it('keeps authorized retries idempotent after the original booking window',async()=>{
  const {store,tx}=rig();
  const d={sucursalId:'branch',nombreContacto:'Invitado idempotente',personas:2,
   inicio:'2026-01-10T14:00:00Z',fin:'2026-01-10T15:00:00Z',
   mesaIds:['table-1'],claveOperacion:'RSV:PAST:REPLAY'};
  const digest=createHash('sha256').update(JSON.stringify({
   actor:u.id,operation:'RESERVATION_CREATE',request:d
  })).digest('hex');
  tx.operacionIdempotente.findUnique.mockResolvedValue({
   hashSolicitud:digest,operacion:'RESERVATION_CREATE',finalizada:true,resultado:{id:'res-1'}
  });
  await expect(store.create(u,d)).resolves.toMatchObject({id:'res-1'});
  expect(tx.reserva.create).not.toHaveBeenCalled();
  expect(tx.$queryRaw).not.toHaveBeenCalled();
 });
 it('can confirm a pending reservation and then cancel one exactly once',async()=>{
  const {store,tx,r}=rig();
  r.estado='PENDIENTE';
  await store.confirm(u,r.id);
  expect(r.estado).toBe('CONFIRMADA');
  await store.cancel(u,r.id,{motivo:'Cliente canceló la visita'});
  expect(r.estado).toBe('CANCELADA');
  await store.cancel(u,r.id,{motivo:'Cliente canceló la visita'});
  expect(tx.eventoReserva.create).toHaveBeenCalledTimes(2);
 });
 it('prevents premature no-show but records it after 15 minutes',async()=>{
  const {store,tx,r}=rig();
  await expect(store.noShow(u,r.id,{motivo:'No se presentó'}))
   .rejects.toThrow('15 minutos');
  vi.useFakeTimers();
  try{
   vi.setSystemTime(new Date(r.inicio.getTime()+16*60000));
   await store.noShow(u,r.id,{motivo:'No se presentó'});
   expect(r.estado).toBe('NO_ASISTIO');
   await store.noShow(u,r.id,{motivo:'No se presentó'});
   expect(tx.eventoReserva.create).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();}
 });
 it('reserves two tables atomically when their combined capacity fits',async()=>{
  const {store,tx}=rig();
  tx.reservaMesa.findMany.mockResolvedValue([]);
  tx.mesa.findMany.mockResolvedValue([{id:'table-1',capacidad:2},{id:'table-2',capacidad:2}]);
  const d={sucursalId:'branch',nombreContacto:'Grupo de cuatro',personas:4,
   inicio:next(75),fin:next(165),mesaIds:['table-1','table-2'],claveOperacion:'RSV:MULTI:001'};
  await expect(store.create(u,d)).resolves.toMatchObject({id:'res-1'});
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  expect(tx.reserva.create).toHaveBeenCalledWith({data:expect.objectContaining({
   personas:4,reservaMesasComoReserva:{create:[
    {mesaId:'table-1'},{mesaId:'table-2'}
   ]}
  })});
 });
 it('allows a read-only branch role to list but forbids booking mutations',async()=>{
  const {store,tx}=rig();
  tx.usuarioRol.findFirst.mockImplementation(async ({where}:any)=>
   where.OR.some((x:any)=>x.rol?.rolPermisosComoRol?.some?.codigo==='reservations.read')
   ?{id:'read-only'}:null);
  await expect(store.list(u,{sucursalId:'branch',page:1,limit:20}))
   .resolves.toHaveProperty('data');
  await expect(store.create(u,{sucursalId:'branch',nombreContacto:'Nuevo',personas:2,
   inicio:next(75),fin:next(165),mesaIds:['table-1'],claveOperacion:'RSV:READ:001'}))
   .rejects.toThrow('Sin permiso');
  expect(tx.reserva.create).not.toHaveBeenCalled();
 });
 it('does not create a duplicate occupation after a check-in replay',async()=>{
  const {store,r,tx}=rig();
  r.estado='COMPLETADA';
  await store.checkIn(u,r.id);
  expect(tx.ocupacionMesa.createMany).not.toHaveBeenCalled();
  expect(tx.eventoReserva.create).not.toHaveBeenCalled();
 });
});
