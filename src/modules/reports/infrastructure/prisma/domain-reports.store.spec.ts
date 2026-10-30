import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {DomainReportsStore} from './domain-reports.store.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
const actor:Principal={id:'u1',nombre:'Admin',email:'admin@dev.test',sessionId:'sess',
 versionAutorizacion:1,debeCambiarContrasena:false};
const d=(x:string)=>new Prisma.Decimal(x);
function rig(){
 const tx={
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'s1',nombre:'Principal',
   activa:true,zonaHoraria:'America/Guatemala',
   configuracionSucursalesComoSucursal:{moneda:'GTQ',horaCorteOperativo:'04:00'}})},
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'role1'})},
  ventaLinea:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0),
   aggregate:vi.fn().mockResolvedValue({_sum:{subtotal:d('33.50'),descuento:d('1.50'),cantidad:d('2.000')}})},
  $queryRaw:vi.fn().mockResolvedValueOnce([{productoId:'prod1',nombre:'Café',categoriaId:'cat1',
   unidades:'2.000',importe:'33.50',descuentos:'1.50'}])
   .mockResolvedValueOnce([{categoriaId:'cat1',categoria:'Bebidas',
    unidades:'2.000',importe:'33.50',descuentos:'1.50'}])
   .mockResolvedValueOnce([
    {varianteId:'v1',variante:'Grande',productoId:'prod1',producto:'Café',
     unidades:'1.000',importe:'25.00',descuentos:'1.00'},
    {varianteId:'v2',variante:'Pequeño',productoId:'prod1',producto:'Café',
     unidades:'1.000',importe:'8.50',descuentos:'0.50'}
   ])
   .mockResolvedValueOnce([
    {modalidad:'MESA',unidades:'1.000',importe:'22.00',descuentos:'1.00'},
    {modalidad:'DELIVERY',unidades:'1.000',importe:'11.50',descuentos:'0.50'}
   ]),
  movimientoInventario:{
   findMany:vi.fn().mockResolvedValue([{id:'mov1',creadoEn:new Date('2026-10-30T17:00:00Z'),
    tipo:'CONSUMO',articulo:{id:'art1',codigo:'A1',nombre:'Harina'},
    ubicacion:{id:'ubic1',almacen:{id:'alm1',codigo:'AL1',nombre:'Principal'}},
    usuario:{id:'u1',nombre:'Admin'},loteId:null,costoUnitario:d('5.333333'),
    costoTotal:d('10.666666'),referenciaTipo:'ConsumoOrden',referenciaId:'con1',claveOperacion:'op1'}]),
   count:vi.fn().mockResolvedValue(1),
   groupBy:vi.fn().mockResolvedValue([{tipo:'CONSUMO',_sum:{costoTotal:d('10.666666')},_count:{id:1}}])
  },
  facturaProveedor:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0),
   groupBy:vi.fn().mockResolvedValue([])}
 };
 const db={$transaction:vi.fn(async(fn:(t:unknown)=>Promise<unknown>)=>fn(tx))} as unknown as PrismaService;
 return {store:new DomainReportsStore(db),tx,db};
}
describe('REP-A source reports data and financial guardrails',()=>{
 it('aggregates sales charts over all matching rows, independent of pagination',async()=>{
  const {store,tx}=rig();
  tx.ventaLinea.count.mockResolvedValue(12);
  const r=await store.records(actor,'SALES_LINES',{
   sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:1}) as any;
  expect(r.meta.total).toBe(12);
  expect(r.totales).toMatchObject({registros:12,importeLineas:'33.50',descuentos:'1.50'});
  expect(r.porProducto).toEqual([{productoId:'prod1',nombre:'Café',categoriaId:'cat1',
   unidades:'2.000',importe:'33.50',descuentos:'1.50'}]);
  expect(r.porCategoria[0].importe).toBe('33.50');
  expect(r.porVariante).toHaveLength(2);
  expect(r.porVariante.map(x=>x.varianteId)).toEqual(['v1','v2']);
  expect(r.porModalidad.map(x=>x.modalidad)).toEqual(['MESA','DELIVERY']);
  for(const group of [r.porProducto,r.porCategoria,r.porVariante,r.porModalidad]){
   const importe=group.reduce((sum:Prisma.Decimal,row:{importe:string})=>
    sum.plus(new Prisma.Decimal(row.importe)),new Prisma.Decimal(0));
   const descuentos=group.reduce((sum:Prisma.Decimal,row:{descuentos:string})=>
    sum.plus(new Prisma.Decimal(row.descuentos)),new Prisma.Decimal(0));
   expect(importe.toFixed(2)).toBe(r.totales.importeLineas);
   expect(descuentos.toFixed(2)).toBe(r.totales.descuentos);
  }
  expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
 });
 it('keeps inventory cost at actual recorded precision and references original movement',async()=>{
  const {store,tx}=rig();
  const x=await store.records(actor,'INVENTORY_MOVEMENTS',{
   sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:20}) as any;
  expect(x.totales.porTipo[0]).toMatchObject({tipo:'CONSUMO',cantidad:1,
   costoRegistrado:'10.666666'});
  expect(x.data[0]).toMatchObject({id:'mov1',costoTotal:'10.666666',
   referenciaTipo:'ConsumoOrden',referenciaId:'con1'});
  expect(tx.movimientoInventario.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{ubicacion:{almacen:{sucursalId:'s1'}},creadoEn:expect.any(Object)}
  }));
  expect(x).not.toHaveProperty('note');
  expect(x).not.toHaveProperty('definitions');
  expect(x).not.toHaveProperty('definicion');
 });
 it('keeps purchase invoices classified by current status and never labels them paid',async()=>{
  const {store,tx}=rig();
  tx.facturaProveedor.groupBy.mockResolvedValue([{
   estado:'BORRADOR',_sum:{total:d('110.00'),subtotal:d('100.00'),impuestos:d('10.00')},_count:{id:1}
  }]);
  tx.facturaProveedor.count.mockResolvedValue(1);
  const x=await store.records(actor,'PURCHASE_INVOICES',{
   sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:20}) as any;
  expect(x.totales.porEstado[0]).toMatchObject({
   estado:'BORRADOR',cantidad:1,totalDocumentos:'110.00'});
  expect(x.totales).not.toHaveProperty('pagos');
 });
 it('denies cross-branch access and requires both reports.read and source permission',async()=>{
  const {store,tx}=rig();
  tx.usuarioRol.findFirst.mockResolvedValueOnce({id:'reports'}).mockResolvedValueOnce(null);
  await expect(store.records(actor,'PURCHASE_INVOICES',{
   sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:20}))
   .rejects.toThrow('purchases.read');
  expect(tx.facturaProveedor.findMany).not.toHaveBeenCalled();
 });
 it('rejects unbounded pagination before querying the database',async()=>{
  const {store,db}=rig();
  await expect(store.records(actor,'INVENTORY_MOVEMENTS',{
   sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',page:1,limit:500}))
   .rejects.toThrow('Paginación');
  expect(db.$transaction).not.toHaveBeenCalled();
 });
});
