import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../generated/prisma/client.js';
import {SupplyStore} from './supply.store.js';
import type {Principal} from '../auth/application/auth.service.js';
import {PrismaService} from '../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../inventory/infrastructure/prisma/inventory-posting.engine.js';

const dec=(v:string)=>new Prisma.Decimal(v);
const user={id:'admin'} as Principal;
function fixture(){
 const op=new Map<string,any>();
 const req:any={id:'req-1',numero:'REQ-01',almacenDestinoId:'dest',
  solicitanteId:'admin',estado:'ABIERTA',nota:null,creadaEn:new Date(),atendidaEn:null,
  requisicionLineasComoRequisicion:[{id:'rl-1',articuloId:'art-1',
   cantidadSolicitada:dec('20'),cantidadAtendida:dec('0'),
   articulo:{id:'art-1',codigo:'ART',nombre:'Vasos',tipo:'EMPAQUE',stockMinimo:null}}],
  transferenciaInventariosComoRequisicion:[]};
 const moves:any[]=[];const transfers:any[]=[];
 const tx={
  requisicion:{findUnique:vi.fn().mockImplementation(async()=>req),findUniqueOrThrow:vi.fn().mockImplementation(async()=>req),
   update:vi.fn().mockImplementation(async({data}:any)=>{Object.assign(req,data);return req;})},
  articuloInventario:{findUnique:vi.fn().mockResolvedValue({id:'art-1',activo:true,requiereLote:false})},
  transferenciaInventario:{
   create:vi.fn().mockImplementation(async({data}:any)=>{
    const t={id:'transfer-1',numero:data.numero,requisicionId:'req-1',
     almacenOrigenId:'origin',almacenDestinoId:'dest',estado:data.estado,
     despachadaEn:data.despachadaEn,recibidaEn:null,
     almacenOrigen:{id:'origin',sucursalId:'branch-origin'},
     almacenDestino:{id:'dest',sucursalId:'branch-dest'},
     transferenciaInventarioLineasComoTransferencia:data.transferenciaInventarioLineasComoTransferencia.create.map((l:any,i:number)=>({
      ...l,id:'tl-'+i,transferenciaId:'transfer-1',cantidadRecibida:null,capasEnTransito:null,costoEnTransito:null}))};
    transfers.push(t);req.transferenciaInventariosComoRequisicion.push(t);return t;
   }),
   findUnique:vi.fn().mockImplementation(async()=>transfers[0]),
   update:vi.fn().mockImplementation(async({data}:any)=>{Object.assign(transfers[0],data);return transfers[0];}),
  },
  transferenciaInventarioLinea:{
   findMany:vi.fn().mockImplementation(async({where}:any)=>{
    const lines=transfers.flatMap(x=>x.transferenciaInventarioLineasComoTransferencia.map((l:any)=>({...l,estadoTransferencia:x.estado})));
    if(where.transferenciaId)return lines.filter((l:any)=>l.transferenciaId===where.transferenciaId);
    return lines.filter((l:any)=>l.articuloId===where.articuloId && l.estadoTransferencia==='EN_TRANSITO');
   }),
   update:vi.fn().mockImplementation(async({where,data}:any)=>{
    const line=transfers.flatMap(x=>x.transferenciaInventarioLineasComoTransferencia).find((l:any)=>l.id===where.id);
    Object.assign(line,data);return line;
   }),
  },
  requisicionLinea:{update:vi.fn().mockImplementation(async({where,data}:any)=>{
   const line=req.requisicionLineasComoRequisicion.find((l:any)=>l.id===where.id);
   line.cantidadAtendida=line.cantidadAtendida.plus(data.cantidadAtendida.increment);return line;
  })},
  operacionIdempotente:{
   findUnique:vi.fn().mockImplementation(async({where}:any)=>op.get(where.clave)??null),
   create:vi.fn().mockImplementation(async({data}:any)=>{op.set(data.clave,data);return data;})},
  eventoAuditoria:{create:vi.fn().mockResolvedValue({})},
  eventoOutbox:{create:vi.fn().mockResolvedValue({})},
 };
 const engine={
  tx:vi.fn().mockImplementation(async(fn:(arg:unknown)=>unknown)=>fn(tx)),
  allowed:vi.fn().mockResolvedValue(undefined),
  warehouse:vi.fn().mockImplementation(async(_tx:unknown,id:string)=>({
   id,sucursalId:id==='origin'?'branch-origin':'branch-dest',
   activo:true,sucursal:{activa:true}})),
  location:vi.fn().mockImplementation(async(_tx:unknown,id:string)=>({
   id,almacenId:id==='from'?'origin':'dest',activa:true})),
  post:vi.fn().mockImplementation(async(_tx:any,v:any)=>{
   moves.push(v);return {movementId:'mov-'+moves.length,costoTotal:v.costoTotalOverride??'20.000000',
    allocations:[{cantidad:v.cantidad,costoUnitario:'1.000000',costoTotal:'20.000000'}]};
  }),
 };
 const db={$transaction:vi.fn()};
 return {store:new SupplyStore(db as unknown as PrismaService,
  engine as unknown as InventoryPostingEngine,{} as any),req,tx,engine,moves,transfers};
}
describe('SUP-A partial fulfillment and stock posting',()=>{
 it('sends 20, receives 18 then 2, preserves valuation and closes requisition automatically',async()=>{
  const f=fixture();
  const send={claveOperacion:'SUP:SEND:0001',almacenOrigenId:'origin',inmediato:false,
   lineas:[{articuloId:'art-1',ubicacionOrigenId:'from',
    ubicacionDestinoId:'to',cantidad:'20'}]};
  const posted=await f.store.send(user,'req-1',send);
  expect(posted.estado).toBe('EN_TRANSITO');
  expect(f.moves).toHaveLength(1);
  expect(f.moves[0].direction).toBe('OUT');
  expect(f.req.requisicionLineasComoRequisicion[0].cantidadAtendida.toFixed(0)).toBe('0');
  const first=await f.store.receive(user,'transfer-1',{
   claveOperacion:'SUP:RECEIVE:0001',observaciones:'Entrega parcial',
   lineas:[{transferenciaLineaId:'tl-0',cantidadRecibida:'18'}]});
  expect(first.estado).toBe('EN_TRANSITO');
  expect(f.req.requisicionLineasComoRequisicion[0].cantidadAtendida.toFixed(0)).toBe('18');
  expect(f.moves[1].direction).toBe('IN');
  expect(f.moves[1].cantidad).toBe('18.000000');
  expect(f.moves[1].costoTotalOverride).toBe('18.000000');
  await f.store.receive(user,'transfer-1',{
   claveOperacion:'SUP:RECEIVE:0002',lineas:[{transferenciaLineaId:'tl-0',cantidadRecibida:'2'}]});
  expect(f.req.estado).toBe('ATENDIDA');
  expect(f.transfers[0].estado).toBe('RECIBIDA');
  expect(f.moves[2].costoTotalOverride).toBe('2.000000');
  const retried=await f.store.receive(user,'transfer-1',{
   claveOperacion:'SUP:RECEIVE:0002',lineas:[{transferenciaLineaId:'tl-0',cantidadRecibida:'2'}]});
  expect(retried.estado).toBe('RECIBIDA');
  expect(f.moves).toHaveLength(3);
 });
 it('rejects over-shipping before touching stock and rejects a changed idempotency payload',async()=>{
  const f=fixture();
  const d={claveOperacion:'SUP:SEND:0003',almacenOrigenId:'origin',
   lineas:[{articuloId:'art-1',ubicacionOrigenId:'from',ubicacionDestinoId:'to',cantidad:'21'}]};
  await expect(f.store.send(user,'req-1',d)).rejects.toThrow('excede');
  expect(f.moves).toHaveLength(0);
  await f.store.send(user,'req-1',{...d,lineas:[{...d.lineas[0],cantidad:'20'}]});
  await expect(f.store.send(user,'req-1',{...d,lineas:[{...d.lineas[0],cantidad:'19'}]}))
   .rejects.toThrow('Clave reutilizada');
 });
 it('one-click direct transfer does not require a requisition',async()=>{
  const f=fixture();
  const result=await f.store.immediate(user,{
   claveOperacion:'SUP:DIRECT:0002',almacenOrigenId:'origin',almacenDestinoId:'dest',
   lineas:[{articuloId:'art-1',ubicacionOrigenId:'from',
    ubicacionDestinoId:'to',cantidad:'6'}]});
  expect(result.estado).toBe('RECIBIDA');
  expect(f.moves.map(x=>x.direction)).toEqual(['OUT','IN']);
  expect(f.req.estado).toBe('ABIERTA');
 });
 it('executes immediate transfer in one transaction without a pending receipt',async()=>{
  const f=fixture();
  const value=await f.store.send(user,'req-1',{
   claveOperacion:'SUP:IMMEDIATE:0001',almacenOrigenId:'origin',inmediato:true,
   lineas:[{articuloId:'art-1',ubicacionOrigenId:'from',ubicacionDestinoId:'to',cantidad:'20'}]});
  expect(value.estado).toBe('RECIBIDA');
  expect(f.req.estado).toBe('ATENDIDA');
  expect(f.moves.map(x=>x.direction)).toEqual(['OUT','IN']);
 });
});
