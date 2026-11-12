import {describe,expect,it,vi} from 'vitest';
import type {Prisma} from '../../../../generated/prisma/client.js';
import {orderCostOutcomes} from './order-cost-outcomes.js';
const branch={id:'s1',nombre:'Principal',moneda:'GTQ',
 desde:'2026-10-01',hasta:'2026-10-30',zonaHoraria:'America/Guatemala',
 corte:'04:00',from:new Date('2026-10-01T10:00:00Z'),
 to:new Date('2026-10-31T10:00:00Z')};
const order={ordenId:'o1',numeroOrden:'ORD-1',estadoActual:'CANCELADA',
 modalidad:'MOSTRADOR',canceladaEn:new Date('2026-10-16T18:00:00Z'),
 clasificacionCancelacion:'PREPARADA',autorizadaCancelacionPreparada:true,
 importeAnulado:'22.00',documentos:2,documentosReceta:1,documentosDirecto:0,
 documentosEmpaque:1,lineas:3,lineasSinMovimiento:0,documentosSinLineas:0,
 documentosIncompletos:0,costoIdentificado:'2.542857',
 costoRecetasIdentificado:'1.542857',costoDirectoIdentificado:'0',
 costoEmpaqueIdentificado:'1.000000',costoCompleto:'2.542857',
 documentosConsumo:['co1','co2']};
describe('REP-A R4/C order cost outcomes',()=>{
 it('keeps consumption/packaging costs and cancelled status separate from sale margins',async()=>{
  const tx={$queryRaw:vi.fn()
   .mockResolvedValueOnce([order])
   .mockResolvedValueOnce([{ordenes:2,documentos:3,documentosReceta:2,
    documentosDirecto:0,documentosEmpaque:1,lineas:4,
    lineasSinMovimiento:0,documentosSinLineas:0,documentosIncompletos:0,
    ordenesIncompletas:0,costoIdentificado:'4.085714',
    costoEmpaqueIdentificado:'1',costoCanceladasIdentificado:'2.542857',
    costoCerradasIdentificado:'1.542857',costoAbiertasIdentificado:'0',
    costoCompleto:'4.085714'}])
   .mockResolvedValueOnce([
    {estadoActual:'CANCELADA',ordenes:1,documentos:2,
     documentosIncompletos:0,costoIdentificado:'2.542857',costoCompleto:'2.542857'},
    {estadoActual:'CERRADA',ordenes:1,documentos:1,
     documentosIncompletos:0,costoIdentificado:'1.542857',costoCompleto:'1.542857'}])};
  const r=await orderCostOutcomes(tx as unknown as Prisma.TransactionClient,branch,1,1);
  expect(r.totales).toMatchObject({ordenes:2,documentos:3,
   documentosEmpaque:1,costoIdentificado:'4.085714',
   costoEmpaqueIdentificado:'1.000000',
   costoCanceladasIdentificado:'2.542857',
   costoCerradasIdentificado:'1.542857',costoCompleto:'4.085714'});
  expect(r.data[0]).toMatchObject({ordenId:'o1',estadoActual:'CANCELADA',
   importeAnulado:'22.00',empaqueRegistrado:true,
   costoRecetasIdentificado:'1.542857',
   costoEmpaqueIdentificado:'1.000000',documentosConsumo:['co1','co2']});
  expect(r.porEstado).toHaveLength(2);
  expect(r.meta).toMatchObject({total:2,page:1,limit:1,totalPages:2});
  expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  expect(r).not.toHaveProperty('note');
 });
 it('shows incomplete provenance as null and unregistered packaging distinctly',async()=>{
  const tx={$queryRaw:vi.fn()
   .mockResolvedValueOnce([{...order,estadoActual:'ABIERTA',documentosEmpaque:0,
    documentosIncompletos:1,lineasSinMovimiento:1,costoCompleto:null,
    costoEmpaqueIdentificado:'0',documentosConsumo:['co1']}])
   .mockResolvedValueOnce([{ordenes:1,documentos:1,documentosReceta:1,
    documentosDirecto:0,documentosEmpaque:0,lineas:1,
    lineasSinMovimiento:1,documentosSinLineas:0,documentosIncompletos:1,
    ordenesIncompletas:1,costoIdentificado:'0',
    costoEmpaqueIdentificado:'0',costoCanceladasIdentificado:'0',
    costoCerradasIdentificado:'0',costoAbiertasIdentificado:'0',costoCompleto:null}])
   .mockResolvedValueOnce([{estadoActual:'ABIERTA',ordenes:1,documentos:1,
    documentosIncompletos:1,costoIdentificado:'0',costoCompleto:null}])};
  const r=await orderCostOutcomes(tx as unknown as Prisma.TransactionClient,branch,1,20);
  expect(r.totales).toMatchObject({costoIdentificado:'0.000000',
   costoCompleto:null,empaqueRegistrado:false,ordenesIncompletas:1});
  expect(r.data[0]).toMatchObject({costoCompleto:null,
   empaqueRegistrado:false,costoEmpaqueIdentificado:'0.000000'});
  expect(r.porEstado[0].costoCompleto).toBe(null);
 });
 it('returns null complete cost for empty period rather than inventing zero',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValueOnce([])
   .mockResolvedValueOnce([]).mockResolvedValueOnce([])};
  const r=await orderCostOutcomes(tx as unknown as Prisma.TransactionClient,branch,2,5);
  expect(r.meta).toEqual({page:2,limit:5,total:0,totalPages:0});
  expect(r.totales).toMatchObject({costoIdentificado:'0.000000',
   costoCompleto:null,empaqueRegistrado:false});
  expect(r.data).toEqual([]);
 });
});
