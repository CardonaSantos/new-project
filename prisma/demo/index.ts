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
// Nest reads the constructor metadata this installs, so it comes before any
// module is imported. Compilation is tsc's, not tsx's, for the same reason:
// see run.mjs.
import 'reflect-metadata';
// Loaded before the guard reads process.env: the variables that authorise this
// run are most conveniently kept in .env, and on Windows the alternative is
// remembering that cmd wants `set` where a shell wants `export`.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service.js';
import { OrderService } from '../../src/modules/orders/application/order.service.js';
import { KitchenService } from '../../src/modules/orders/application/kitchen.service.js';
import { CashService } from '../../src/modules/payments/application/cash.service.js';
import { PaymentsService } from '../../src/modules/payments/application/payments.service.js';
import { RecipeService } from '../../src/modules/recipes/application/recipe.service.js';
import { FinanceService } from '../../src/modules/finance/application/finance.service.js';
import { DeliveryService } from '../../src/modules/delivery/application/delivery.service.js';
import { FinanceClosingService } from '../../src/modules/finance/application/finance-closing.service.js';
import { FinanceBankService } from '../../src/modules/finance/application/finance-bank.service.js';
import { PurchaseOrdersService } from '../../src/modules/purchases/application/purchase-orders.service.js';
import { PurchaseReceiptsService } from '../../src/modules/purchases/application/purchase-receipts.service.js';
import { PurchaseInvoicesService } from '../../src/modules/purchases/application/purchase-invoices.service.js';
import { PurchasePaymentsService } from '../../src/modules/purchases/application/purchase-payments.service.js';
import { SelfServiceService } from '../../src/modules/self-service/application/self-service.service.js';
import { ReservationsService } from '../../src/modules/reservations/application/reservations.service.js';
import { SupplyService } from '../../src/modules/supply/application/supply.service.js';
import { InventoryInternalConsumptionService } from '../../src/modules/inventory/application/inventory-internal-consumption.service.js';
import { InventoryOperationsService } from '../../src/modules/inventory/application/inventory-operations.service.js';
import { assertAllowed, parseOptions, progress, DEMO_PREFIX } from './runtime.js';
import { validateDemoData } from './validate.js';
import { writeMasters } from './masters.js';
import { restockBranch, stockBranches } from './purchases.js';
import { asPrincipal, runHistory } from './history.js';
import { auditDates, marker, shiftSince } from './backdate.js';
import { resetDemo } from './reset.js';
import { coverage, coverageReport } from './coverage.js';

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
      where: { usuarioRolesComoUsuario: { some: { rol: { codigo: 'SUPER_ADMIN' } } }, activo: true },
      orderBy: { creadoEn: 'asc' },
    });
    if (!adminRow)
      throw Error('No hay un usuario SUPER_ADMIN: ejecute primero "npm run seed:initial".');
    const admin = asPrincipal(adminRow.id, adminRow.email);

    const started = marker();
    // Se informa al final, después de la auditoría de fechas: si falta algo,
    // las dos cosas ayudan a encontrar por qué.
    let uncovered: string[] = [];
    let ids = null as Awaited<ReturnType<typeof writeMasters>> | null;

    if (options.fases.includes('maestros')) {
      ids = await writeMasters(db, options, process.env.DEMO_SEED_PASSWORD!);
    } else {
      // Later phases need the id maps, and rebuilding them is just the masters
      // phase again: upserts, so it costs little and keeps them honest.
      progress('compras', 'reconstruyendo identificadores desde los maestros');
      ids = await writeMasters(db, options, process.env.DEMO_SEED_PASSWORD!);
    }

    // El QR de cada mesa lo emite el gerente desde Mesas; issueTableQr desactiva
    // el anterior de esa mesa, así que repetirlo en otra corrida solo rota el
    // código. Sin estos tokens los pedidos QR de la historia no tienen por
    // dónde entrar.
    const issueQr = async (): Promise<void> => {
      const selfService = app.get(SelfServiceService);
      for (const [branchCode, tableIds] of ids!.tables) {
        const managerId = ids!.staff.get(branchCode)?.get('ADMIN_SUCURSAL');
        if (!managerId || !tableIds.length) continue;
        const manager = asPrincipal(managerId, `gerente.${branchCode.toLowerCase()}@demo.local`);
        const issued: { mesaId: string; token: string }[] = [];
        for (const mesaId of tableIds) {
          const qr = await selfService.issueTableQr(manager, mesaId);
          issued.push({ mesaId, token: qr.token });
        }
        ids!.qrTokens.set(branchCode, issued);
      }
      progress('maestros', `QR emitidos para ${[...ids!.qrTokens.values()].reduce((n, l) => n + l.length, 0)} mesas`);
    };

    const purchaseServices = () => ({
      orders: app.get(PurchaseOrdersService) as never,
      receipts: app.get(PurchaseReceiptsService) as never,
      invoices: app.get(PurchaseInvoicesService) as never,
      payments: app.get(PurchasePaymentsService) as never,
    });

    if (options.fases.includes('compras')) {
      // El abastecimiento inicial se fecha antes de que el período empiece.
      // Sin esto las órdenes de compra, las recepciones, las facturas y los
      // pagos a proveedor quedaban con la fecha de hoy mientras las ventas se
      // extendían ocho semanas hacia atrás: el demo mostraba un negocio que
      // compró hoy lo que llevaba dos meses vendiendo. El reajuste está
      // acotado al instante en que corre, de modo que los vencimientos de lote
      // —que apuntan al futuro a propósito— no se mueven.
      const beforeStock = marker();
      // Dentro de la marca: el QR queda fechado con la apertura, antes del mes.
      await issueQr();
      await stockBranches(db, purchaseServices(), admin, ids, options);
      const moved = await shiftSince(db, beforeStock, options.semanas * 7 + 2);
      progress('compras', `abastecimiento fechado ${options.semanas * 7 + 2} días atrás (${moved} columnas)`);
    }

    if (options.fases.includes('historia')) {
      if (![...ids.qrTokens.values()].some((l) => l.length)) await issueQr();
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
          finance: app.get(FinanceService) as never,
          delivery: app.get(DeliveryService) as never,
          closing: app.get(FinanceClosingService) as never,
          selfService: app.get(SelfServiceService) as never,
          reservations: app.get(ReservationsService) as never,
          supply: app.get(SupplyService) as never,
          consumption: app.get(InventoryInternalConsumptionService) as never,
          inventoryOps: app.get(InventoryOperationsService) as never,
          bank: app.get(FinanceBankService) as never,
        },
        ids,
        options,
        admin,
        // La reposición semanal corre dentro de la historia, al abrir cada
        // semana: así cada ciclo queda fechado en su lunes por el reajuste
        // diario, y compra solo el déficit contra lo que de verdad quedó.
        (branchCode, week) => restockBranch(db, purchaseServices(), admin, ids, branchCode, week, options),
      );

      // Lo que el cliente debería encontrar, contado. Una tabla vacía que la
      // corrida tenía que llenar es un fallo, no un «listo».
      const report = coverageReport(await coverage(db, ids, options));
      process.stdout.write(`\nCobertura del demo:\n${report.text}\n`);
      uncovered = report.missing;
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

    if (uncovered.length) {
      throw Error(
        `El demo quedó sin: ${uncovered.join(', ')}. Las causas están en los fallos tolerados de arriba.`,
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
  // And the cause matters more than the message: a service reports a unique
  // violation and a serialisation failure with the same words, so without the
  // Prisma error underneath there is no way to tell a real race from a
  // duplicate that will never succeed however many times it is retried.
  for (let cause = (error as Error)?.cause; cause; cause = (cause as Error)?.cause) {
    const e = cause as Error & { code?: string; meta?: unknown };
    process.stderr.write(
      `\nCausa: ${e.code ? e.code + ' ' : ''}${e.message}` +
        (e.meta ? `\n  ${JSON.stringify(e.meta)}\n` : '\n'),
    );
  }
  process.exit(1);
});
