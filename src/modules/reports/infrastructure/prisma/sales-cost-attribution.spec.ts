import {describe,expect,it,vi} from 'vitest';
import {salesCostAttribution} from './sales-cost-attribution.js';
import type {Prisma} from '../../../../generated/prisma/client.js';

const scope={id:'s1',nombre:'Sucursal principal',moneda:'GTQ',
 desde:'2026-10-01',hasta:'2026-10-30',zonaHoraria:'America/Guatemala',
 corte:'04:00',from:new Date('2026-10-01T10:00:00Z'),
 to:new Date('2026-10-31T10:00:00Z')};
const completeRow={id:'vl1',ventaId:'v1',ordenLineaId:'ol1',ordenId:'ord1',
 numeroOrden:'ORD-1',fecha:new Date('2026-10-30T16:00:00Z'),modalidad:'MESA',
 productoId:'prod1',producto:'Café',varianteId:'var1',variante:'Grande',
 descripcion:'Café grande',cantidad:'0.500',ingreso:'11.00',cobertura:'COMPLETO',
 costosDirectos:'0.771429',documentosConsumo:['cons1']};
describe('REP-A sale cost allocation report',()=>{
 it('keeps exact six-decimal cost allocation and null margins for uncovered sales',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValueOnce([
   completeRow,{...completeRow,id:'vl2',cobertura:'CONSUMO_INCOMPLETO',
    costosDirectos:null,documentosConsumo:['cons2']}
  ]).mockResolvedValueOnce([{lineas:2,lineasConCosto:1,lineasSinCosto:1,
   lineasNoAplicables:0,ingresos:'22.00',costoIdentificado:'0.771429',
   margenAntesEmpaque:null}]).mockResolvedValueOnce([
   {productoId:'prod1',producto:'Café',lineas:2,lineasConCosto:1,
    lineasSinCosto:1,lineasNoAplicables:0,ingresos:'22.00',
    costoIdentificado:'0.771429',margenAntesEmpaque:null}
  ])};
  const r=await salesCostAttribution(tx as unknown as Prisma.TransactionClient,scope,1,100);
  expect(r.meta).toEqual({page:1,limit:100,total:2,totalPages:1});
  expect(r.totales).toMatchObject({ingresos:'22.00',costoDirectoIdentificado:'0.771429',
   margenAntesEmpaque:null,lineasConCosto:1,lineasSinCosto:1});
  expect(r.data[0]).toMatchObject({ventaLineaId:'vl1',costoDirecto:'0.771429',
   margenAntesEmpaque:'10.228571',cobertura:'COMPLETO',documentosConsumo:['cons1']});
  expect(r.data[1]).toMatchObject({costoDirecto:null,
   margenAntesEmpaque:null,cobertura:'CONSUMO_INCOMPLETO'});
  expect(r.porProducto[0]).toMatchObject({margenAntesEmpaque:null,registros:2});
  expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
 });
 it('returns zero records and zero cost without inventing a margin',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValueOnce([])
   .mockResolvedValueOnce([{lineas:0,lineasConCosto:0,lineasSinCosto:0,
    lineasNoAplicables:0,ingresos:'0',costoIdentificado:'0',margenAntesEmpaque:null}])
   .mockResolvedValueOnce([])};
  const r=await salesCostAttribution(tx as unknown as Prisma.TransactionClient,scope,2,1);
  expect(r.meta).toEqual({page:2,limit:1,total:0,totalPages:0});
  expect(r.totales).toMatchObject({ingresos:'0.00',
   costoDirectoIdentificado:'0.000000',margenAntesEmpaque:null});
  expect(r.data).toEqual([]);
 });
 it('preserves totals independently of requested page size',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValueOnce([completeRow])
   .mockResolvedValueOnce([{lineas:8,lineasConCosto:8,lineasSinCosto:0,
    lineasNoAplicables:0,ingresos:'154.00',costoIdentificado:'22.499999',
    margenAntesEmpaque:'131.500001'}]).mockResolvedValueOnce([])};
  const r=await salesCostAttribution(tx as unknown as Prisma.TransactionClient,scope,1,1);
  expect(r.meta).toMatchObject({total:8,totalPages:8});
  expect(r.data).toHaveLength(1);
  expect(r.totales).toMatchObject({ingresos:'154.00',
   costoDirectoIdentificado:'22.499999',margenAntesEmpaque:'131.500001'});
 });
});
