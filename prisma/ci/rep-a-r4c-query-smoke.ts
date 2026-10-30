import assert from 'node:assert/strict';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient,Prisma} from '../../src/generated/prisma/client.js';
import {salesCostAttribution} from '../../src/modules/reports/infrastructure/prisma/sales-cost-attribution.js';
import {orderCostOutcomes} from '../../src/modules/reports/infrastructure/prisma/order-cost-outcomes.js';

// Executes the REAL reporting SQL against the migrated PostgreSQL schema,
// even when no business fixtures are seeded. DEV Postman still validates data.
const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL required for REP-A CI SQL smoke');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
const scope={id:'rep-a-nonexistent-branch',nombre:'CI',moneda:'GTQ',
 desde:'2026-10-01',hasta:'2026-10-30',zonaHoraria:'America/Guatemala',
 corte:'04:00',from:new Date('2026-10-01T10:00:00Z'),
 to:new Date('2026-10-31T10:00:00Z')};
try{
 await db.$connect();
 const res=await db.$transaction(async tx=>{
  const sales=await salesCostAttribution(tx,scope,1,20);
  const orders=await orderCostOutcomes(tx,scope,1,20);
  return {sales,orders};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
 assert.equal(res.sales.totales.registros,0);
 assert.equal(res.sales.totales.margenAntesEmpaque,null);
 assert.equal(res.orders.totales.ordenes,0);
 assert.equal(res.orders.totales.costoCompleto,null);
 assert.equal(res.orders.totales.empaqueRegistrado,false);
 console.info('REP-A R4B/R4C SQL smoke: migrated PostgreSQL queries OK');
}finally{
 await db.$disconnect();
}
