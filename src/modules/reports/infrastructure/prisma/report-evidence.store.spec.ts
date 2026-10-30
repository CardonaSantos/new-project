import {describe,it,expect,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {ReportEvidenceStore} from './report-evidence.store.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Principal} from '../../../auth/application/auth.service.js';
const u:Principal={id:'u1',nombre:'Admin',email:'admin@dev.example',sessionId:'sess',
 versionAutorizacion:1,debeCambiarContrasena:false};
const d=(x:string)=>new Prisma.Decimal(x);
function rig(){
 const tx={
  usuarioRol:{findFirst:vi.fn().mockResolvedValue({id:'role1'})},
  sucursal:{findUnique:vi.fn().mockResolvedValue({id:'s1',nombre:'Principal',
   codigo:'PRINCIPAL',activa:true,zonaHoraria:'America/Guatemala',
   configuracionSucursalesComoSucursal:{horaCorteOperativo:'04:00',moneda:'GTQ'}})},
  turnoCaja:{findFirst:vi.fn().mockResolvedValue({id:'shift1',
   fechaOperativa:new Date('2026-10-30T00:00:00.000Z'),
   abiertaEn:new Date('2026-10-30T14:00:00.000Z'),cerradaEn:null,
   fondoInicial:d('0.00'),efectivoEsperado:null,efectivoContado:null,
   diferencia:null,notaCierre:null,
   caja:{id:'caja1',codigo:'CAJA1',nombre:'Caja principal'},
   cajero:{id:'user1',nombre:'Ana'},arqueoCajasComoTurno:null})},
  movimientoCaja:{
   findMany:vi.fn().mockResolvedValue([]),
   count:vi.fn().mockResolvedValue(0),
   groupBy:vi.fn().mockResolvedValue([])
  },
  pago:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)},
  gastoOperativo:{findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0)}
 };
 const db={$transaction:vi.fn(async(run:(tx:unknown)=>Promise<unknown>)=>run(tx))} as unknown as PrismaService;
 return {store:new ReportEvidenceStore(db),tx,db};
}
const pay=(id:string,monto:string)=>({
 id,turnoId:'shift1',tipo:'INGRESO',monto:d(monto),motivo:'Cobro',
 creadoEn:new Date('2026-10-30T16:00:00.000Z'),
 usuario:{id:'admin',nombre:'Ana'},pagoId:'p-'+id,reembolsoId:null,gastoId:null,
 pagoProveedorId:null,liquidacionRepartidorId:null,
 pago:{id:'p-'+id,monto:d(monto),metodo:'EFECTIVO',referencia:null,
  cobradoEn:new Date('2026-10-30T16:00:00.000Z'),
  cuenta:{id:'cuenta1',orden:{id:'orden1',numero:'ORD-100'}}},
 reembolso:null,gasto:null,pagoProveedor:null,liquidacionRepartidor:null
});
describe('REP-A evidence provenance and branch authorization',()=>{
 it('explains aggregate cash movement Q66 with original Pago IDs, order and actor',async()=>{
  const {store,tx}=rig();
  tx.movimientoCaja.findMany.mockResolvedValue([pay('m1','22.00'),pay('m2','44.00')]);
  tx.movimientoCaja.count.mockResolvedValue(2);
  tx.movimientoCaja.groupBy.mockResolvedValue([
   {tipo:'INGRESO',_sum:{monto:d('66.00')},_count:{id:2}}]);
  const response=await store.cashShift(u,'shift1',
   {sucursalId:'s1',page:1,limit:20}) as any;
  expect(response.totalesFiltro).toMatchObject({ingresos:'66.00',
   egresos:'0.00',saldoMovimientos:'66.00',cantidadIngresos:2});
  expect(response.data.map((x:any)=>x.movimientoId)).toEqual(['m1','m2']);
  expect(response.data[0].fuente).toMatchObject({
   tipo:'PAGO',tabla:'Pago',id:'p-m1',cuentaId:'cuenta1',
   numeroOrden:'ORD-100',importeDocumento:'22.00'});
  expect(response.data[0].registradoPor.nombre).toBe('Ana');
  expect(response.data[0].referenciaIds.pagoId).toBe('p-m1');
  expect(tx.movimientoCaja.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{turnoId:'shift1'},skip:0,take:20
  }));
 });
 it('identifies manual movements as MANUAL, without pretending they are sale payments',async()=>{
  const {store,tx}=rig();
  tx.movimientoCaja.findMany.mockResolvedValue([{...pay('m3','7.00'),pagoId:null,pago:null,
   motivo:'Fondo extra autorizado'}]);
  tx.movimientoCaja.count.mockResolvedValue(1);
  const response=await store.cashShift(u,'shift1',
   {sucursalId:'s1',page:1,limit:20,tipo:'INGRESO'}) as any;
  expect(response.data[0].fuente).toMatchObject({tipo:'MANUAL',tabla:'MovimientoCaja',id:'m3'});
  expect(response.filtro.tipo).toBe('INGRESO');
 });
 it('requires reports.read AND cash.read for cash evidence',async()=>{
  const {store,tx}=rig();tx.usuarioRol.findFirst.mockResolvedValueOnce({id:'reports'}).mockResolvedValueOnce(null);
  await expect(store.cashShift(u,'shift1',{sucursalId:'s1',page:1,limit:20}))
   .rejects.toThrow('cash.read');
  expect(tx.turnoCaja.findFirst).not.toHaveBeenCalled();
 });
 it('does not disclose a cash shift belonging to another branch',async()=>{
  const {store,tx}=rig();tx.turnoCaja.findFirst.mockResolvedValue(null);
  await expect(store.cashShift(u,'foreign',{sucursalId:'s1',page:1,limit:20}))
   .rejects.toThrow('Turno no encontrado');
  expect(tx.movimientoCaja.findMany).not.toHaveBeenCalled();
 });
 it('rejects unbounded evidence pages before touching PostgreSQL',async()=>{
  const {store,db}=rig();
  await expect(store.cashShift(u,'shift1',{sucursalId:'s1',page:1,limit:1000}))
   .rejects.toThrow('Paginación');
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('lists payments with source cash movement and refund IDs, without multiplying money',async()=>{
  const {store,tx}=rig();
  tx.pago.findMany.mockResolvedValue([{
   id:'pay1',cobradoEn:new Date('2026-10-30T17:00:00.000Z'),
   monto:d('66.00'),metodo:'EFECTIVO',referencia:'abc',
   turnoId:'shift1',recibidoPorRepartidor:false,cobradoPor:{id:'u1',nombre:'Ana'},
   cuenta:{id:'acc1',orden:{id:'ord1',numero:'ORD-101'}},
   movimientoCajasComoPago:{id:'mov1',turnoId:'shift1',monto:d('66.00'),tipo:'INGRESO'},
   reembolsoPagosComoPago:[{id:'refund1',monto:d('5.00'),creadoEn:new Date('2026-10-31T14:00:00.000Z')}]
  }]);
  tx.pago.count.mockResolvedValue(1);
  const response=await store.payments(u,{sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',
   page:1,limit:20}) as any;
  expect(response.data[0]).toMatchObject({pagoId:'pay1',importe:'66.00',
   movimientoCajaId:'mov1',numeroOrden:'ORD-101'});
  expect(response.data[0].reembolsos[0]).toMatchObject({id:'refund1',monto:'5.00'});
  expect(response.meta.total).toBe(1);
 });
 it('lists expenses with expense and original cash evidence IDs',async()=>{
  const {store,tx}=rig();
  tx.gastoOperativo.findMany.mockResolvedValue([{
   id:'g1',registradoEn:new Date('2026-10-30T18:00:00Z'),descripcion:'Artículos de limpieza',
   categoria:'LIMPIEZA',tipo:'OPERATIVO',monto:d('8.50'),documentoReferencia:'DOC42',
   usuario:{id:'u1',nombre:'Ana'},proveedor:{id:'prov',nombre:'Proveedor A'},
   cuentaFinancieraId:null,turnoId:'shift1',
   movimientoCajasComoGasto:{id:'m8',turnoId:'shift1',tipo:'EGRESO',monto:d('8.50')}
  }]);tx.gastoOperativo.count.mockResolvedValue(1);
  const response=await store.expenses(u,{sucursalId:'s1',periodo:'DIA',fecha:'2026-10-30',
   page:1,limit:20}) as any;
  expect(response.data[0]).toMatchObject({
   gastoId:'g1',importe:'8.50',movimientoCajaId:'m8',documentoReferencia:'DOC42'});
 });
});
