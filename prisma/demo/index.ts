/**
 * Entry point for the demonstration seed.
 *
 *   npm run seed:demo
 *   npm run seed:demo -- --fase=historia --sucursal=rapida
 *   npm run seed:demo -- --semanas=2 --tickets=10
 *   npm run seed:demo -- --reset
 *   npm run seed:demo -- --simular
 *
 * Requires DEMO_SEED_ALLOW=yes and DEMO_SEED_PASSWORD on the machine being
 * seeded. Run "npm run seed:initial" first: this phase needs the units,
 * conversions and operational roles that one registers, and refuses to invent
 * them.
 *
 * The transactional phases drive the application's own services through a
 * standalone Nest context, so what the demo shows is what the system
 * computes. Masters go in directly; see masters.ts for why.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { OrderService } from '../../src/modules/orders/application/order.service.js';
import { KitchenService } from '../../src/modules/orders/application/kitchen.service.js';
import { CashService } from '../../src/modules/payments/application/cash.service.js';
import { PaymentsService } from '../../src/modules/payments/application/payments.service.js';
import { RecipeService } from '../../src/modules/recipes/application/recipe.service.js';
import { FinanceService } from '../../src/modules/finance/application/finance.service.js';
import { FinanceClosingService } from '../../src/modules/finance/application/finance-closing.service.js';
import { PurchaseOrdersService } from '../../src/modules/purchases/application/purchase-orders.service.js';
import { PurchaseReceiptsService } from '../../src/modules/purchases/application/purchase-receipts.service.js';
import { PurchaseInvoicesService } from '../../src/modules/purchases/application/purchase-invoices.service.js';
import { PurchasePaymentsService } from '../../src/modules/purchases/application/purchase-payments.service.js';
import { assertAllowed, parseOptions, progress, DEMO_PREFIX } from './runtime.js';
import { validateDemoData } from './validate.js';
import { writeMasters } from './masters.js';
import { stockBranches } from './purchases.js';
import { asPrincipal, runHistory } from './history.js';
import { auditDates, marker } from './backdate.js';
import { resetDemo } from './reset.js';

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  assertAllowed(process.env);

  // Data problems are caught before a connection is opened: a referential
  // mistake otherwise surfaces as a half-written database partway into a run
  // that takes the better part of an hour.
  const problems = validateDemoData();
  if (problems.length) {
    process.stderr.write(`Los datos del demo tienen ${problems.length} problemas:\n`);
    for (const problem of problems) process.stderr.write('  - ' + problem + '\n');
    process.exit(1);
  }
  progress('maestros', `datos verificados; fases: ${options.fases.join(', ')}`);

  if (options.simular) {
    process.stdout.write(
      `Simulación: ${options.fases.join(', ')} sobre ` +
        `${options.sucursales.length ? options.sucursales.join(', ') : 'las 4 sucursales'}, ` +
        `${options.semanas} semanas, ~${options.tickets} tickets/día.\n` +
        'No se escribió nada.\n',
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const db = app.get(PrismaService);

  try {
    if (options.reset) {
      progress('maestros', 'borrando lo que creó el demo');
      const removed = await resetDemo(db);
      progress('maestros', `${removed} filas borradas`);
    }

    // The business owner does the buying and signs the closings; the branch
    // staff created by the masters phase do the daily work, so the audit trail
    // reads like a business rather than one account doing everything.
    const adminRow = await db.usuario.findFirst({
      where: { usuarioRoles: { some: { rol: { codigo: 'SUPER_ADMIN' } } }, activo: true },
      orderBy: { creadoEn: 'asc' },
    });
    if (!adminRow)
      throw Error('No hay un usuario SUPER_ADMIN: ejecute primero "npm run seed:initial".');
    const admin = asPrincipal(adminRow.id, adminRow.email);

    const started = marker();
    let ids = null as Awaited<ReturnType<typeof writeMasters>> | null;

    if (options.fases.includes('maestros')) {
      ids = await writeMasters(db, options, process.env.DEMO_SEED_PASSWORD!);
    } else {
      // Later phases need the id maps, and rebuilding them is just the masters
      // phase again: upserts, so it costs little and keeps them honest.
      progress('compras', 'reconstruyendo identificadores desde los maestros');
      ids = await writeMasters(db, options, process.env.DEMO_SEED_PASSWORD!);
    }

    if (options.fases.includes('compras')) {
      await stockBranches(
        db,
        {
          orders: app.get(PurchaseOrdersService) as never,
          receipts: app.get(PurchaseReceiptsService) as never,
          invoices: app.get(PurchaseInvoicesService) as never,
          payments: app.get(PurchasePaymentsService) as never,
        },
        admin,
        ids,
        options,
      );
    }

    if (options.fases.includes('historia')) {
      const payments = app.get(PaymentsService) as never;
      await runHistory(
        db,
        {
          orders: app.get(OrderService) as never,
          kitchen: app.get(KitchenService) as never,
          accounts: payments,
          cash: app.get(CashService) as never,
          recipes: app.get(RecipeService) as never,
          inventory: payments,
          expenses: app.get(FinanceService) as never,
          closing: app.get(FinanceClosingService) as never,
        },
        ids,
        options,
        admin,
      );
    }

    // Anything still stamped after the run began is a column the shift missed,
    // and it shows up as one corner of the demo dated today while everything
    // around it sits weeks back. Reported rather than thrown: the data is
    // usable, and knowing which table is off is what makes it fixable.
    const leftovers = await auditDates(db, started);
    if (leftovers.length) {
      process.stdout.write('\nColumnas que quedaron con fecha de esta corrida:\n');
      for (const { table, column, rows } of leftovers)
        process.stdout.write(`  ${table}.${column}: ${rows} filas\n`);
      process.stdout.write(
        'Las de maestros y catálogo son esperadas; si aparece una tabla de operación, avise.\n',
      );
    }

    process.stdout.write(
      `\nListo. Usuarios de demostración: gerente|cajero|mesero|cocina|almacen` +
        `.<sucursal>@demo.local, con la contraseña de DEMO_SEED_PASSWORD.\n` +
        `Sucursales: ${DEMO_PREFIX}REPOSTERIA, ${DEMO_PREFIX}CAFETERIA, ` +
        `${DEMO_PREFIX}RESTAURANTE, ${DEMO_PREFIX}RAPIDA.\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\nLa semilla de demostración falló: ${(error as Error).message}\n`);
  // The stack matters here: this runs unattended for the better part of an
  // hour and the message alone rarely says which phase gave up.
  if (error instanceof Error && error.stack) process.stderr.write(error.stack + '\n');
  process.exit(1);
});
