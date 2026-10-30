import assert from 'node:assert/strict';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient,Prisma} from '../../src/generated/prisma/client.js';
import {paymentSalesReconciliation,supplierBalances,platformSettlements,bankMatchStatus}
 from '../../src/modules/reports/infrastructure/prisma/financial-reconciliation.js';
import {financialBranchRollup} from '../../src/modules/reports/infrastructure/prisma/branch-rollup.js';
import {exportDaily} from '../../src/modules/reports/infrastructure/prisma/export-daily.js';

// Real PostgreSQL migrations + raw SQL/type/shape smoke. This does not replace
// the real DEV reconciliation Postman collections.
const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL required for REP-A R5/R6 smoke');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const b={id:'rep-a-ci-no-such-branch',nombre:'CI',moneda:'GTQ',
 desde:'2026-10-01',hasta:'2026-10-30',zonaHoraria:'America/Guatemala',
 corte:'04:00',from:new Date('2026-10-01T10:00:00Z'),
 to:new Date('2026-10-31T10:00:00Z')};
try{
 await db.$connect();
 await db.$transaction(async tx=>{
  const [dailyPayments,dailyCosts]=await Promise.all([
   exportDaily(tx,b,'PAYMENT_SALES_RECON'),
   exportDaily(tx,b,'ORDER_COST_OUTCOMES')]);
  assert.deepEqual(dailyPayments.diario,[]);
  assert.deepEqual(dailyCosts.diario,[]);
  const [payments,supplier,platform,bank,rollup]=await Promise.all([
   paymentSalesReconciliation(tx,b,1,20),supplierBalances(tx,b,1,20),
   platformSettlements(tx,b,1,20),bankMatchStatus(tx,b,1,20),
   financialBranchRollup(tx,[b])]);
  assert.equal(payments.totales.cuentas,0);
  assert.equal(payments.totales.cobrado,'0.00');
  assert.equal(supplier.totales.facturas,0);
  assert.equal(platform.totales.liquidaciones,0);
  assert.equal(bank.totales.lineas,0);
  assert.equal(rollup.data.length,1);
  assert.equal(rollup.data[0].ventas,0);
  assert.equal(rollup.totalesPorMoneda[0].ingresos,'0.00');
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
 console.info('REP-A R5/R6 financial reconciliation and branch rollup SQL: OK');
}finally{
 await db.$disconnect();
}
