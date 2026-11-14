/**
 * Initial stocking, through the real purchase flow.
 *
 * Order, confirm, receive, invoice, pay — each step the service it would take
 * from the app, so the stock and the cost layers behind it are the ones the
 * system computes rather than numbers written into tables. This is where the
 * demo earns the right to answer "what did this actually cost me".
 *
 * Only the opening stock lives here. Replenishment belongs to the history
 * phase, interleaved with consumption: buying the same coffee three times at
 * three prices is what moves a weighted average, and doing it all up front
 * would leave the average frozen on day one.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { Principal } from '../../src/modules/auth/application/auth.service.js';
import { articles } from './articles.js';
import { products } from './products.js';
import { branches, menus } from './branches.js';
import { packagingRules, suppliers, type DemoPresentation } from './supply.js';
import { productionRecipes, saleRecipes } from './recipes.js';
import { modifierGroups } from './products.js';
import { progress, Rng, type DemoOptions } from './runtime.js';
import { code, type MasterIds } from './masters.js';

type Db = PrismaClient;

/** Services the phase drives, resolved from the Nest context by the caller. */
export interface PurchaseServices {
  orders: { create(u: Principal, d: unknown): Promise<any>; confirm(u: Principal, id: string, d: unknown): Promise<any> };
  receipts: { create(u: Principal, d: unknown): Promise<any>; confirm(u: Principal, id: string, d: unknown): Promise<any> };
  invoices: { create(u: Principal, d: unknown): Promise<any>; confirm(u: Principal, id: string, d: unknown): Promise<any> };
  payments: { create(u: Principal, d: unknown): Promise<any>; confirm(u: Principal, id: string, d: unknown): Promise<any> };
}

/** Prisma takes these as strings; the DTOs validate the shape with a regex. */
const qty = (value: number): string => value.toFixed(6).replace(/\.?0+$/, '') || '0';
const money = (value: number): string => value.toFixed(2);

/**
 * Which articles a branch actually needs.
 *
 * Derived from what the branch sells rather than stocked blindly: a branch
 * that doesn't sell burgers has no business holding buns. Walks the menu to
 * its recipes, through production recipes to their own ingredients, and adds
 * the packaging its service modes consume plus the supplies every kitchen uses.
 */
export function articlesNeededBy(branchCode: string): Set<string> {
  const branch = branches.find((b) => b.codigo === branchCode)!;
  const offered = new Set(
    branch.menus.flatMap((c) => menus.find((m) => m.codigo === c)!.secciones.flatMap((s) => s.skus)),
  );
  const needed = new Set<string>();

  const expand = (articleCode: string): void => {
    if (needed.has(articleCode)) return;
    needed.add(articleCode);
    // A preparation is not bought, it is produced: pull in what produces it.
    const recipe = productionRecipes.find((r) => r.resultado === articleCode);
    for (const component of recipe?.componentes ?? []) expand(component.articulo);
  };

  for (const sku of offered) {
    const variant = products.flatMap((p) => p.variantes.map((v) => ({ ...v, tipo: p.tipo }))).find((v) => v.sku === sku);
    if (!variant) continue;
    if (variant.articulo) expand(variant.articulo);
    for (const component of saleRecipes.find((r) => r.sku === sku)?.componentes ?? []) expand(component.articulo);
    // Modifier options consume too, and a branch that offers almond milk has
    // to stock it even though no recipe mentions it.
    for (const groupCode of variant.modificadores ?? []) {
      for (const option of modifierGroups.find((g) => g.codigo === groupCode)?.opciones ?? []) {
        if (option.componente) expand(option.componente.articulo);
      }
    }
  }

  const modes = Object.entries(branch.modalidades).filter(([, share]) => share > 0).map(([mode]) => mode);
  for (const rule of packagingRules) {
    if (!modes.includes(rule.modalidad)) continue;
    if (rule.sucursal && rule.sucursal !== branchCode) continue;
    if (rule.sku && !offered.has(rule.sku)) continue;
    for (const line of rule.lineas) needed.add(line.articulo);
  }
  for (const article of articles) if (article.tipo === 'SUMINISTRO') needed.add(article.codigo);

  // Anything with a production recipe is made, not bought — its ingredients
  // came in above. The test is the recipe, not the article type: PRODUCTO_
  // TERMINADO covers both whole cakes, which are produced, and bottled drinks,
  // which are purchased.
  for (const articleCode of [...needed]) {
    if (productionRecipes.some((r) => r.resultado === articleCode)) needed.delete(articleCode);
  }
  return needed;
}

/** Whole presentations to cover an opening stock, never a fraction of a sack. */
function packsToBuy(articleCode: string, presentation: DemoPresentation, weeks: number, rng: Rng): number {
  const article = articles.find((a) => a.codigo === articleCode)!;
  // stockMinimo is the floor the business set; opening stock aims a few weeks
  // above it so the first days of operation don't start on empty.
  const target = (article.stockMinimo ?? 0) * (1 + weeks / 4) * rng.float(0.9, 1.2);
  const perPack = presentation.cantidad * (presentation.unidadCompra === 'LB' ? 453.59237 : presentation.unidadCompra === 'L' ? 1000 : 1);
  return Math.max(1, Math.ceil(target / Math.max(perPack, 1)));
}

/**
 * Short document references, built from both codes rather than cut out of the
 * operation key.
 *
 * They were `key.slice(-14)` and friends, which is shorter but cuts from the
 * wrong end: the branch code sits at the front of the key, so every branch
 * produced the same reference for a given supplier. FacturaProveedor is unique
 * on [proveedorId, numeroDocumento], so the second branch collided — and
 * atomic() reports a unique violation with the same message as a serialisation
 * failure, which sent us looking for a race that could not exist in a loop
 * this sequential. The lot codes collided the same way and said nothing at
 * all: lotFor reuses a lot it finds, so the second branch would have quietly
 * drawn its stock from the first branch's lot.
 */
const docRef = (branch: string, supplier: string) =>
  `${branch.slice(0, 3)}-${supplier.replace(/^PROV-/, '').slice(0, 4)}`;

/**
 * Lots for the articles that track them.
 *
 * Expiry is set relative to now, not to the backdated day: the posting engine
 * refuses to consume from a lot already expired as of today, and consumption
 * happens before the clock is corrected. The shift moves these along with
 * everything else afterwards.
 */
async function lotFor(
  db: Db,
  articleCode: string,
  articleId: string,
  reference: string,
  rng: Rng,
): Promise<string | null> {
  const article = articles.find((a) => a.codigo === articleCode)!;
  if (!article.lote) return null;
  const codigoLote = `${code(articleCode)}-${reference}`;
  const expiry = new Date();
  // Perishables get a believable remaining life; dry goods tracked by lot get
  // a long one so they never block a consumption mid-run.
  expiry.setUTCDate(expiry.getUTCDate() + (article.vencimiento ? rng.int(12, 45) : 400));
  const existing = await db.loteInventario.findFirst({ where: { articuloId: articleId, codigoLote } });
  if (existing) return existing.id;
  const row = await db.loteInventario.create({
    data: {
      articuloId: articleId,
      codigoLote,
      fechaElaboracion: new Date(),
      fechaVencimiento: article.vencimiento ? expiry : null,
    },
  });
  return row.id;
}

export async function stockBranches(
  db: Db,
  services: PurchaseServices,
  actor: Principal,
  ids: MasterIds,
  options: DemoOptions,
): Promise<void> {
  const rng = new Rng(0x5eed0001);

  for (const branch of branches) {
    const branchId = ids.branches.get(branch.codigo);
    if (!branchId) continue;
    const warehouseId = ids.warehouses.get(branch.codigo)!;
    const locationId = ids.locations.get(branch.codigo)!;
    const needed = articlesNeededBy(branch.codigo);

    for (const supplier of suppliers) {
      const lines = supplier.presentaciones.filter((p) => needed.has(p.articulo));
      if (!lines.length) continue;

      // Deterministic, so a re-run is recognised as the same operation rather
      // than stocking the branch twice: `once()` short-circuits on this key.
      const key = `DEMO-STOCK-${branch.codigo}-${supplier.codigo}`;
      const ref = docRef(branch.codigo, supplier.codigo);
      const orderLines = lines.map((presentation) => {
        const packs = packsToBuy(presentation.articulo, presentation, options.semanas, rng);
        const unitsPerPack = presentation.cantidad;
        const unitPrice = presentation.precio / unitsPerPack;
        const factor = presentation.unidadCompra === 'LB' ? 453.59237 : presentation.unidadCompra === 'L' ? 1000 : 1;
        return {
          articuloId: ids.articles.get(presentation.articulo)!,
          presentacionId: ids.presentations.get(`${supplier.codigo}:${presentation.articulo}`)!,
          // cantidadCompra is in purchase units, so packs times units per pack:
          // base quantity is this times factorAUnidadBase, which is what the
          // purchase store multiplies.
          cantidadCompra: qty(packs * unitsPerPack),
          factorAUnidadBase: qty(factor),
          precioUnitarioCompra: money(unitPrice),
          articleCode: presentation.articulo,
        };
      });

      const order = await services.orders.create(actor, {
        claveOperacion: key + '-ORD',
        proveedorId: ids.suppliers.get(supplier.codigo)!,
        sucursalId: branchId,
        observaciones: `Abastecimiento inicial de ${branch.nombre}`,
        lineas: orderLines.map(({ articleCode, ...line }) => line),
      });
      await services.orders.confirm(actor, order.id, { claveOperacion: key + '-OCF' });

      // Receipt lines must pair with order lines one to one: the store rejects
      // a receipt that references an order while any line does not.
      const placed = await db.ordenCompraLinea.findMany({
        where: { ordenCompraId: order.id },
        select: { id: true, articuloId: true, cantidadCompra: true, factorAUnidadBase: true, precioUnitarioCompra: true },
      });
      const receiptLines = [];
      for (const line of placed) {
        const articleCode = orderLines.find((l) => l.articuloId === line.articuloId)!.articleCode;
        receiptLines.push({
          ordenCompraLineaId: line.id,
          articuloId: line.articuloId,
          ubicacionId: locationId,
          loteId: (await lotFor(db, articleCode, line.articuloId, ref, rng)) ?? undefined,
          cantidadCompra: qty(Number(line.cantidadCompra)),
          factorAUnidadBase: qty(Number(line.factorAUnidadBase)),
          precioUnitarioCompra: money(Number(line.precioUnitarioCompra)),
        });
      }
      const receipt = await services.receipts.create(actor, {
        ordenCompraId: order.id,
        proveedorId: ids.suppliers.get(supplier.codigo)!,
        almacenId: warehouseId,
        referenciaProveedor: `REM-${ref}`,
        lineas: receiptLines,
      });
      // Confirming is what posts the stock and opens the cost layers.
      await services.receipts.confirm(actor, receipt.id, { claveOperacion: key + '-RCF' });

      const today = new Date().toISOString().slice(0, 10);
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 30);
      const invoice = await services.invoices.create(actor, {
        proveedorId: ids.suppliers.get(supplier.codigo)!,
        sucursalId: branchId,
        numeroDocumento: `FAC-${ref}`,
        fechaEmision: today,
        fechaVencimiento: due.toISOString().slice(0, 10),
        precioIncluyeImpuesto: true,
        lineas: receiptLines.map((line) => ({
          articuloId: line.articuloId,
          descripcion: articles.find((a) => ids.articles.get(a.codigo) === line.articuloId)!.nombre,
          cantidad: line.cantidadCompra,
          precioUnitario: line.precioUnitarioCompra,
        })),
      });
      await services.invoices.confirm(actor, invoice.id, { claveOperacion: key + '-FCF' });

      const total = receiptLines.reduce(
        (sum, line) => sum + Number(line.cantidadCompra) * Number(line.precioUnitarioCompra),
        0,
      );
      const payment = await services.payments.create(actor, {
        claveOperacion: key + '-PAG',
        proveedorId: ids.suppliers.get(supplier.codigo)!,
        sucursalId: branchId,
        metodo: 'TRANSFERENCIA',
        monto: money(total),
        referencia: `TRF-${ref}`,
        aplicaciones: [{ facturaId: invoice.id, monto: money(total) }],
      });
      await services.payments.confirm(actor, payment.id, { claveOperacion: key + '-PCF' });

      progress('compras', `${branch.codigo}: ${supplier.nombre}, ${receiptLines.length} artículos por Q${total.toFixed(2)}`);
    }
  }
}
