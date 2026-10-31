import {describe,expect,it,vi} from 'vitest';
import {Prisma} from '../../../../generated/prisma/client.js';
import {paymentSalesReconciliation,supplierBalances,platformSettlements,bankMatchStatus}
 from './financial-reconciliation.js';
const scope={id:'branch1',nombre:'Principal',moneda:'GTQ',desde:'2026-10-01',
 hasta:'2026-10-30',zonaHoraria:'America/Guatemala',corte:'04:00',
 from:new Date('2026-10-01T10:00:00Z'),to:new Date('2026-10-31T10:00:00Z')};
const sql=(...responses:unknown[])=>({$queryRaw:vi.fn().mockResolvedValueOnce(responses[0])
 .mockResolvedValueOnce(responses[1])});
describe('REP-A R5 finance ledger reconciliation',()=>{
 it('distinguishes payments with no sale and refunds of their original payment cohort',async()=>{
  const tx=sql([{cuentaId:'c1',ordenId:'o1',numeroOrden:'ORD-1',estadoOrden:'ABIERTA',
   estadoCuenta:'ABIERTA',ventaId:null,ventaCerradaEn:null,cuentaTotal:'22',
   cuentaPagado:'22',pagos:1,cobrado:'22',reembolsadoHistorico:'0',
   netoHistorico:'22'}],
   [{cuentas:2,cuentasSinVenta:1,cuentasConVenta:1,pagos:2,
    cobrado:'44',reembolsadoHistorico:'2',netoHistorico:'42'}]);
  const r=await paymentSalesReconciliation(tx as unknown as Prisma.TransactionClient,scope,1,1);
  expect(r.totales).toMatchObject({cuentas:2,cuentasSinVenta:1,
   cobrado:'44.00',reembolsadoHistorico:'2.00',netoHistorico:'42.00'});
  expect(r.data[0]).toMatchObject({reconocimientoVenta:'SIN_VENTA',cobrado:'22.00',
   ventaId:null,netoHistorico:'22.00'});
  expect(r.meta).toEqual({page:1,limit:1,total:2,totalPages:2});
 });
 it('supplier balance subtracts only confirmed applications without clamping negative balances',async()=>{
  const tx=sql([{id:'f1',proveedorId:'pr1',proveedor:'Proveedor',
   numeroDocumento:'F1',fechaEmision:new Date('2026-10-10T00:00:00Z'),
   confirmadaEn:new Date('2026-10-10T12:00:00Z'),fechaVencimiento:null,
   total:'100',pagosAplicados:'60',creditosAplicados:'10',saldo:'30'}],
   [{facturas:1,proveedores:1,facturado:'100',pagosAplicados:'60',
    creditosAplicados:'10',saldo:'30',saldoNegativo:0}]);
  const r=await supplierBalances(tx as unknown as Prisma.TransactionClient,scope,1,10);
  expect(r.totales).toMatchObject({facturas:1,facturado:'100.00',
   pagosAplicados:'60.00',creditosAplicados:'10.00',saldo:'30.00',
   facturasConSaldoNegativo:0});
  expect(r.data[0]).toMatchObject({saldo:'30.00'});
 });
 it('platform totals come from settlement headers, not joined line multiplicity',async()=>{
  const tx={
   liquidacionCanalExterno:{findMany:vi.fn().mockResolvedValue([{id:'l1',
    canalId:'platform1',cuentaFinancieraId:null,periodoInicio:new Date(),
    periodoFin:new Date(),referencia:null,totalBruto:new Prisma.Decimal('100'),
    totalComision:new Prisma.Decimal('10'),totalNeto:new Prisma.Decimal('90'),
    recibidaEn:null,creadaEn:new Date(),
    liquidacionCanalExternoLineasComoLiquidacion:[{id:'line1',entregaId:'d1',
     importeBruto:new Prisma.Decimal('100'),comision:new Prisma.Decimal('10'),
     importeNeto:new Prisma.Decimal('90')}] }]),
    count:vi.fn().mockResolvedValue(2),
    aggregate:vi.fn().mockResolvedValue({_sum:{totalBruto:new Prisma.Decimal('200'),
     totalComision:new Prisma.Decimal('20'),totalNeto:new Prisma.Decimal('180')}})}
  };
  const r=await platformSettlements(tx as unknown as Prisma.TransactionClient,scope,1,1);
  expect(r.meta).toMatchObject({total:2,totalPages:2});
  expect(r.totales).toMatchObject({bruto:'200.00',comisiones:'20.00',neto:'180.00'});
  expect(r.data[0].lineas).toHaveLength(1);
 });
 it('bank status retains global matched count independent of paging',async()=>{
  const tx={lineaExtractoBancario:{
   findMany:vi.fn().mockResolvedValue([{id:'bank1',cuentaFinancieraId:'acc1',
    fecha:new Date('2026-10-30T00:00:00Z'),monto:new Prisma.Decimal('-12'),
    movimientoFinancieroId:null,conciliadoEn:null,validacionReferencia:null}]),
   count:vi.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(3),
   aggregate:vi.fn().mockResolvedValue({_sum:{monto:new Prisma.Decimal('152')}})
  }};
  const r=await bankMatchStatus(tx as unknown as Prisma.TransactionClient,scope,1,1);
  expect(r.totales).toMatchObject({lineas:8,conciliadas:5,pendientes:3,
   movimientoExtracto:'152.00'});
  expect(r.data[0]).toMatchObject({conciliado:false,monto:'-12.00'});
  expect(r.meta).toMatchObject({total:8,totalPages:8});
  expect(tx.lineaExtractoBancario.findMany.mock.calls[0][0].where.fecha)
   .toEqual({gte:new Date('2026-10-01T00:00:00Z'),lte:new Date('2026-10-30T00:00:00Z')});
 });
});
