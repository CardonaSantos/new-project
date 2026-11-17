/**
 * Three weeks of Café Pepita de Oro, driven through the real services.
 *
 * Every ticket here is created, sent to the kitchen, prepared, charged and
 * closed by the same code the app calls, so the stock it consumed, the cost
 * layers it drew from and the margin it produced are the system's own
 * arithmetic. That is the whole reason this phase is slow.
 *
 * Each stretch of a simulated day — the delivery, the morning production,
 * the opening, every ticket, the closing — is written at today's clock and
 * then moved back to its local hour, so a day reads like a day: tickets from
 * seven to a quarter to seven, in order. See backdate.ts for why the clock
 * cannot simply be told what to say.
 *
 * Resuming needs no state file: a day whose CierreOperativo exists is a day
 * already lived, so the phase skips it.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { Principal } from '../../src/modules/auth/application/auth.service.js';
import { articles, baseQty } from './articles.js';
import { modifierGroups, products } from './products.js';
import { branches, menus } from './branches.js';
import { productionRecipes, saleRecipes } from './recipes.js';
import { localDay, localInstant, shiftSince } from './backdate.js';
import {
  batchChance,
  CAFE_HOURS,
  formatDay,
  operationalDays,
  progress,
  Rng,
  ticketsForDay,
  type DemoOptions,
} from './runtime.js';
import type { MasterIds } from './masters.js';
import {
  endOfDayWaste,
  internalConsumption,
  weeklyCount,
  type CustomerRef,
  type OperationsServices,
  type Seat,
} from './operations.js';
import { bankStatement, monthlyBills, type TreasuryServices } from './treasury.js';

type Db = PrismaClient;
type Service = Record<string, (...args: any[]) => Promise<any>>;

/** The services this phase drives, pulled from the Nest context by the caller. */
export interface HistoryServices extends OperationsServices, TreasuryServices {
  /** SelfServiceService: el pedido que el comensal hace desde el QR de su mesa. */
  selfService: Service;
  orders: Service;
  kitchen: Service;
  accounts: Service;
  cash: Service;
  recipes: Service;
  inventory: Service;
  /** FinanceService: emite intenciones y registra gastos. */
  finance: Service;
  /** DeliveryService: el ciclo de una entrega a domicilio. */
  delivery: Service;
  closing: Service;
}

/** Direcciones de entrega, para que una orden a domicilio se vea real. */
const ADDRESSES = [
  '4a calle 7-22 zona 1',
  '12 avenida 3-45 zona 10',
  'Calzada Roosevelt 15-30',
  '6a avenida 9-18 zona 9',
  'Boulevard Los Próceres 24-69',
  '3a calle 2-14 zona 3',
  'Avenida Reforma 8-60 zona 9',
  '7a avenida 11-05 zona 4',
] as const;

const money = (value: number): string => value.toFixed(2);
const qty = (value: number): string => value.toFixed(3).replace(/\.?0+$/, '') || '1';

/**
 * Services only read `id` off the principal — permission checks go to the
 * database with it — so the rest is filled in to satisfy the type.
 */
export function asPrincipal(id: string, email: string): Principal {
  return { id, email, nombre: email, sessionId: 'demo-seed', debeCambiarContrasena: false, versionAutorizacion: 1 };
}

interface Sellable {
  sku: string;
  variantId: string;
  price: number;
  prepared: boolean;
  modifierGroups: string[];
  /** Weight in the branch's sales mix. */
  weight: number;
}

/**
 * What a branch sells, with a weight per item.
 *
 * Uniform picking produces a sales report where everything sold equally,
 * which no real business has ever looked like. Cheap staples carry most of
 * the volume and expensive items the tail, which is what makes a top-sellers
 * report say something.
 */
async function sellablesFor(db: Db, branchCode: string, ids: MasterIds): Promise<Sellable[]> {
  const branch = branches.find((b) => b.codigo === branchCode)!;
  const offered = new Set(
    branch.menus.flatMap((c) => menus.find((m) => m.codigo === c)!.secciones.flatMap((s) => s.skus)),
  );
  const branchId = ids.branches.get(branchCode)!;
  const sellables: Sellable[] = [];
  for (const sku of offered) {
    const variantId = ids.variants.get(sku);
    if (!variantId) continue;
    // Una variante pausada o deshabilitada en la sucursal no aparece en el POS
    // ni en el QR, y el store la rechaza con «Variante no habilitada en
    // sucursal». La pausa corre desde hoy, así que cubre todo el mes simulado:
    // el demo la muestra pausada y no la vende.
    const override = await db.varianteSucursal.findUnique({
      where: { varianteId_sucursalId: { varianteId: variantId, sucursalId: branchId } },
    });
    if (override && (!override.habilitada || (override.pausadaHasta && override.pausadaHasta > new Date()))) continue;
    const price = await db.precioVariante.findFirst({
      where: { varianteId: variantId, sucursalId: branchId, vigenteHasta: null },
    });
    if (!price) continue;
    const product = products.find((p) => p.variantes.some((v) => v.sku === sku))!;
    const variant = product.variantes.find((v) => v.sku === sku)!;
    const amount = Number(price.importe);
    sellables.push({
      sku,
      variantId,
      price: amount,
      prepared: product.tipo === 'PREPARADO',
      modifierGroups: variant.modificadores ?? [],
      // Cheaper items move more: a rough inverse curve, floored so nothing is
      // unsellable and capped so staples don't crowd everything else out.
      weight: Math.min(10, Math.max(1, 220 / Math.max(amount, 8))),
    });
  }
  return sellables;
}

/** Picks the lines of one ticket, with the modifiers a customer would ask for. */
/**
 * La forma de un ticket, en tablas compartidas.
 *
 * Las usa composeTicket para armar cada ticket, y la producción para estimar
 * cuánto va a consumir el mostrador en el día. Compartidas a propósito: si la
 * forma del ticket cambia aquí, la estimación la sigue sola, en lugar de
 * quedar como dos copias de los mismos números que divergen en silencio.
 */
/** El producto de servicio que cobra el envío. */
export const DELIVERY_FEE_SKU = 'SKU-SERVICIO-DOMICILIO';

const LINE_COUNT_WEIGHTS = [[1, 32], [2, 34], [3, 20], [4, 9], [5, 5]] as const;
const LINE_UNIT_WEIGHTS = [[1, 78], [2, 16], [3, 6]] as const;
const OPTIONAL_MODIFIER_CHANCE = 0.22;

const mean = (pairs: readonly (readonly [number, number])[]): number => {
  let value = 0;
  let weight = 0;
  for (const [v, w] of pairs) {
    value += v * w;
    weight += w;
  }
  return value / weight;
};
/** Líneas que trae un ticket promedio, y unidades que trae una línea. */
const MEAN_LINES = mean(LINE_COUNT_WEIGHTS);
const MEAN_UNITS = mean(LINE_UNIT_WEIGHTS);

export function composeTicket(sellables: Sellable[], rng: Rng, modality: string) {
  const lineCount = rng.weighted(LINE_COUNT_WEIGHTS);
  const chosen: { sellable: Sellable; units: number; mods: string[] }[] = [];
  // El cargo de domicilio está en la carta para tener precio, pero nadie lo
  // pide: lo agrega la orden a domicilio, abajo.
  const pool = sellables.filter((s) => s.sku !== DELIVERY_FEE_SKU);
  for (let i = 0; i < lineCount; i++) {
    const sellable = rng.weighted(pool.map((s) => [s, s.weight] as const));
    if (chosen.some((c) => c.sellable.sku === sellable.sku)) continue;
    const mods: string[] = [];
    for (const groupCode of sellable.modifierGroups) {
      const group = modifierGroups.find((g) => g.codigo === groupCode)!;
      // A required group always resolves; optional ones are the exception a
      // customer asks for, not the rule.
      if (group.minimo > 0) mods.push(rng.pick(group.opciones).codigo);
      else if (rng.chance(OPTIONAL_MODIFIER_CHANCE)) mods.push(rng.pick(group.opciones).codigo);
    }
    chosen.push({
      sellable,
      units: rng.weighted(LINE_UNIT_WEIGHTS),
      mods,
    });
  }
  if (!chosen.length) chosen.push({ sellable: rng.pick(pool), units: 1, mods: [] });
  // Delivery adds its own fee line, which is where the service product earns
  // its place in the catalog.
  return { lines: chosen, needsFee: modality === 'DELIVERY' };
}

/**
 * El método se elige antes de conocer el importe, porque decide el camino: el
 * cobro rápido no acepta transferencia. El importe llega después, y en el
 * camino largo sale de la cuenta, no de mi suma de líneas.
 */
export function paymentMethod(modality: string, rng: Rng): string {
  return rng.weighted(
    modality === 'DELIVERY'
      ? ([['TARJETA', 55], ['EFECTIVO', 35], ['TRANSFERENCIA', 10]] as const)
      : ([['EFECTIVO', 52], ['TARJETA', 38], ['TRANSFERENCIA', 10]] as const),
  );
}

export function paymentsFor(total: number, modality: string, rng: Rng) {
  return paymentParts(paymentMethod(modality, rng), total, rng);
}

export function paymentParts(method: string, total: number, rng: Rng) {
  if (method === 'EFECTIVO') {
    // Cash comes in rounded up, which is what makes change worth computing.
    const given = Math.ceil(total / 10) * 10;
    return [{ metodo: method, monto: money(total), efectivoRecibido: money(Math.max(given, total)) }];
  }
  if (method === 'TARJETA') {
    // Una tarjeta que se cobra en el momento exige el código de autorización
    // del datáfono; sin él el store la rechaza.
    return [{
      metodo: method,
      monto: money(total),
      referencia: `REF-${rng.int(100000, 999999)}`,
      codigoAutorizacion: `AUT${rng.int(100000, 999999)}`,
    }];
  }
  // La transferencia queda pendiente de verificación, que es justamente lo que
  // el demo debe mostrar en la bandeja de cobros por confirmar.
  return [{ metodo: method, monto: money(total), referencia: `REF-${rng.int(100000, 999999)}` }];
}

/** Runs the production batches a branch needs to have something to sell. */
async function runProduction(
  db: Db,
  services: HistoryServices,
  actor: Principal,
  branchCode: string,
  ids: MasterIds,
  dayKey: string,
  rng: Rng,
  first: boolean,
  tickets: number,
  sellables: Sellable[],
): Promise<number> {
  const locationId = ids.locations.get(branchCode)!;
  const needed = new Set<string>();
  const branch = branches.find((b) => b.codigo === branchCode)!;
  const offered = new Set(
    branch.menus.flatMap((c) => menus.find((m) => m.codigo === c)!.secciones.flatMap((s) => s.skus)),
  );
  // Only what this branch actually consumes, walked through nested recipes.
  const want = (articleCode: string) => {
    if (needed.has(articleCode)) return;
    const recipe = productionRecipes.find((r) => r.resultado === articleCode);
    if (!recipe) return;
    needed.add(articleCode);
    for (const component of recipe.componentes) want(component.articulo);
  };
  for (const sku of offered) {
    for (const component of saleRecipes.find((r) => r.sku === sku)?.componentes ?? []) want(component.articulo);
    const variant = products.flatMap((p) => p.variantes).find((v) => v.sku === sku);
    if (variant?.articulo) want(variant.articulo);
  }
  // Y lo que consumen los modificadores. El jarabe de vainilla no está en
  // ninguna receta de venta: entra por la opción «Jarabe de vainilla» de un
  // grupo de modificadores, y como este recorrido no los miraba, el jarabe no
  // se producía nunca. La cafetería vendía lattes pidiendo un jarabe que no
  // existía, con disponible 0 desde el primer día.
  for (const group of modifierGroups) {
    for (const option of group.opciones) {
      if (option.componente) want(option.componente.articulo);
    }
  }

  let batches = 0;
  // Deepest first: a cake needs its sponge to exist before it can be built.
  const ordered = [...needed].sort((a, b) => {
    const depth = (x: string): number => {
      const r = productionRecipes.find((rr) => rr.resultado === x);
      return r ? 1 + Math.max(0, ...r.componentes.map((c) => depth(c.articulo))) : 0;
    };
    return depth(a) - depth(b);
  });
  // Qué se hace hoy, y cuánto: demanda primero, decisión después, y el horno
  // al final.
  //
  // El primer día se hace todo, sin sorteo: una preparación tiene que existir
  // antes de poder venderse. Después, cada día se hornea el faltante contra
  // las existencias reales de la ubicación, con la frecuencia que la vida
  // útil le da a cada receta. Lo que sobra de ayer cuenta: un jarabe que dura
  // semanas no se repite hasta que se acaba, y el bizcocho se hace a diario.

  // Lo que el mostrador va a consumir hoy, por artículo. Sale de la misma
  // mezcla con que se arman los tickets: los pesos reales de venta de cada
  // SKU (la versión anterior repartía uniforme entre todos los SKUs, y una
  // rebanada popular consumía el triple de lo estimado), las recetas de
  // venta, la venta directa por variante —un pastel entero no pasa por
  // receta de venta— y los modificadores, que es por donde entran los
  // jarabes.
  const counter = new Map<string, number>();
  {
    const add = (code: string, amount: number): void => {
      counter.set(code, (counter.get(code) ?? 0) + amount);
    };
    const totalWeight = sellables.reduce((sum, item) => sum + item.weight, 0) || 1;
    for (const item of sellables) {
      const lines = tickets * MEAN_LINES * (item.weight / totalWeight);
      const units = lines * MEAN_UNITS;
      for (const component of saleRecipes.find((r) => r.sku === item.sku)?.componentes ?? []) {
        add(component.articulo, units * baseQty(component) * (1 + (component.merma ?? 0) / 100));
      }
      const variant = products.flatMap((p) => p.variantes).find((v) => v.sku === item.sku);
      if (variant?.articulo) add(variant.articulo, units);
      for (const groupCode of item.modifierGroups) {
        const group = modifierGroups.find((g) => g.codigo === groupCode)!;
        const groupChance = group.minimo > 0 ? 1 : OPTIONAL_MODIFIER_CHANCE;
        for (const option of group.opciones) {
          if (!option.componente) continue;
          add(
            option.componente.articulo,
            lines * (groupChance / group.opciones.length) * baseQty(option.componente),
          );
        }
      }
    }
    // Un cuarto de margen: la mezcla de un día concreto se desvía de su
    // media, y quedarse corto cancela órdenes.
    for (const [code, amount] of counter) counter.set(code, amount * 1.25);
  }

  // Lo que ya hay en la ubicación, que es lo que una producción de verdad
  // mira antes de encender el horno.
  const stock = await db.existencia.findMany({
    where: { ubicacionId: locationId },
    select: { articuloId: true, cantidad: true },
  });
  const onHand = new Map<string, number>();
  for (const row of stock) {
    onHand.set(row.articuloId, (onHand.get(row.articuloId) ?? 0) + Number(row.cantidad));
  }

  // Dos mapas a propósito. `need` acumula lo que las producciones de hoy van
  // a consumir de sus componentes; `produce` es lo que de verdad se hornea.
  // La versión anterior usaba uno solo para las dos cosas, y un hijo cuyo
  // stock alcanzaba (make <= 0) conservaba en el mapa la demanda que sus
  // padres le habían anotado: el bucle del horno lo producía igual, por esa
  // cantidad, aunque la decisión había sido no hornear.
  const need = new Map<string, number>();
  const produce = new Map<string, number>();
  for (const articleCode of [...ordered].reverse()) {
    const recipe = productionRecipes.find((r) => r.resultado === articleCode)!;
    const shelfLife = recipe.vidaUtilDias ?? 30;
    const have = onHand.get(ids.articles.get(articleCode)!) ?? 0;
    // Doble cobertura para lo que dura más de un día: la demanda de un día
    // concreto se desvía de su media, y con treinta corridas simuladas la
    // cobertura simple dejaba sin frijol o sin jarabe un día movido. Lo que
    // dura un solo día —el atol— no: se hace la olla del día a la medida, y lo
    // que sobra se descarta como merma al cierre.
    const cover = shelfLife <= 1 ? 1 : 2;
    const demand = (need.get(articleCode) ?? 0) + (counter.get(articleCode) ?? 0) * cover;
    // El dado hornea por adelantado, pero solo cuando queda menos de dos días
    // de cobertura. Sin esa condición, una preparación de vida corta se hacía
    // casi a diario aunque el estante estuviera lleno —max(tanda, faltante)
    // ignoraba lo que había— y la simulación acumulaba cuarenta litros de
    // caldo en dos semanas: el inventario del demo se veía de fábrica, no de
    // restaurante.
    const wellStocked = have >= demand * 2;
    const batch =
      shelfLife > 1 && !wellStocked && (first || rng.chance(batchChance(shelfLife)))
        ? recipe.rendimiento * rng.float(0.8, 1.3)
        : 0;
    let make = Math.max(batch, demand - have);
    if (make <= 0) continue;
    // Nadie enciende el horno por treinta mililitros: si se produce, al menos
    // media tanda.
    make = Math.max(make, recipe.rendimiento * 0.5);
    // Lo que sale por pieza se hace por tanda entera: un pan de banano se
    // hornea completo y los rellenitos salen por docena, no 7.3 rebanadas.
    if (articles.find((a) => a.codigo === articleCode)?.unidad === 'UND') {
      make = Math.ceil(make / recipe.rendimiento) * recipe.rendimiento;
    }
    produce.set(articleCode, make);
    // Lo que esta hornada va a consumir, anotado a quien lo produce — con la
    // cantidad que de verdad se hornea, no la planeada antes de los pisos.
    const batchesOf = make / recipe.rendimiento;
    for (const component of recipe.componentes) {
      if (!productionRecipes.some((r) => r.resultado === component.articulo)) continue;
      const needs = batchesOf * baseQty(component) * (1 + (component.merma ?? 0) / 100);
      need.set(component.articulo, (need.get(component.articulo) ?? 0) + needs);
    }
  }

  for (const articleCode of ordered) {
    const planned = produce.get(articleCode);
    if (!planned) continue;
    const recipe = productionRecipes.find((r) => r.resultado === articleCode)!;
    const shelfLife = recipe.vidaUtilDias ?? 30;
    const articleId = ids.articles.get(articleCode)!;
    const version = await db.recetaVersion.findFirst({
      where: { receta: { tipo: 'PRODUCCION', articuloResultadoId: articleId }, activa: true },
      select: { id: true },
    });
    if (!version) continue;
    const expiry = new Date();
    expiry.setUTCDate(expiry.getUTCDate() + shelfLife);
    try {
      await services.recipes.execute(actor, {
        recetaVersionId: version.id,
        ubicacionDestinoId: locationId,
        ubicacionConsumoId: locationId,
        cantidadProducida: qty(planned),
        claveOperacion: `DEMO-PRO-${branchCode}-${articleCode}-${dayKey}`.slice(0, 120),
        // Relative to now on purpose: the posting engine refuses to consume a
        // lot already expired today, and the clock is corrected afterwards.
        fechaVencimiento: expiry.toISOString().slice(0, 10),
      });
      batches++;
    } catch (error) {
      // Not enough of an ingredient is a real outcome of a busy week, not a
      // reason to abandon the day — but it gets counted.
      note(`producción de ${articleCode}`, error);
    }
  }
  return batches;
}

/**
 * Swallowed failures, grouped by step and message.
 *
 * A ticket that cannot be served is a real outcome of a busy week, and that
 * is why these steps forgive an error instead of abandoning the day. But a
 * bare `catch {}` makes a day where nothing worked look exactly like a day
 * where everything did: the first run of this phase reported success having
 * sold nothing at all, across four branches and seven days, and said not one
 * word about why. Forgiving an error and hiding it are different things.
 */
const failures = new Map<string, number>();

/**
 * Códigos por id, para que un fallo diga `HARINA-FUERTE` y no
 * `cmwgs40m60022ucv4hqp758qq`. Un mensaje con un cuid no se puede diagnosticar
 * sin ir a consultar la base, que es exactamente lo que estas corridas
 * intentan evitar.
 */
let names = new Map<string, string>();

/**
 * El texto útil de un error de Nest.
 *
 * Once fallos de ticket y cuatro de cierre se reportaron con el mensaje
 * vacío: una excepción de validación lleva el detalle en el cuerpo de la
 * respuesta —y como arreglo, en un arreglo— mientras que `.message` queda en
 * blanco. Un fallo sin texto no se puede diagnosticar.
 */
function describe(error: unknown): string {
  const e = error as {
    message?: unknown;
    response?: unknown;
    getResponse?: () => unknown;
  };
  const body = typeof e?.getResponse === 'function' ? e.getResponse() : e?.response;
  const detail =
    typeof body === 'string'
      ? body
      : ((): string | undefined => {
          const m = (body as { message?: unknown } | undefined)?.message;
          if (Array.isArray(m)) return m.join('; ');
          return typeof m === 'string' ? m : undefined;
        })();
  const text = [detail, typeof e?.message === 'string' ? e.message : undefined].find(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
  // El mensaje no siempre es todo el cuerpo. La producción, por ejemplo,
  // adjunta `insuficientes` con el artículo, lo requerido y lo disponible —
  // que es exactamente lo que hace falta para saber por qué faltó— y leer
  // solo `message` lo tiraba.
  const rest =
    body && typeof body === 'object' && !Array.isArray(body)
      ? Object.entries(body as Record<string, unknown>)
          .filter(([k]) => !['message', 'statusCode', 'error'].includes(k))
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ')
      : '';
  const base = text ?? (error as object)?.constructor?.name ?? String(error);
  return rest ? `${base} ${rest}` : base;
}

function note(step: string, error: unknown): void {
  const message = describe(error);
  // Un error de Prisma empieza con un salto de línea, así que la primera
  // línea está vacía: por eso ciento treinta fallos se agruparon bajo un
  // mensaje en blanco, dos corridas seguidas. Y cuando la cabecera es la
  // genérica de Prisma, la razón de verdad va al final del texto.
  const readable = message.replace(/\bc[a-z0-9]{20,}\b/g, (id) => names.get(id) ?? id);
  const lines = readable.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const head = lines[0] ?? '(sin mensaje)';
  const reason = head.startsWith('Invalid `prisma') ? (lines.at(-1) ?? head) : head;
  const key = `${step}: ${reason.slice(0, 220)}`;
  failures.set(key, (failures.get(key) ?? 0) + 1);
}

/** Grouped, most frequent first, because the same cause repeats by the dozen. */
export function historyFailures(): string[] {
  return [...failures.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `  ${count}×  ${key}`);
}

/** Lo que un ticket necesita saber de la sucursal más allá de su menú. */
interface TicketExtras {
  /** Los QR vigentes de sus mesas. */
  qr: { mesaId: string; token: string }[];
  /** Sus clientes registrados, para teléfono y web. */
  clients: CustomerRef[];
  /** La mesa de una reserva que acaba de llegar. */
  seat?: Seat;
  /** Existencia de un artículo en la ubicación, por código. */
  onHand: (articleCode: string) => Promise<number>;
}

/** Lo que la cafetería produce en casa: lo único que el cajero ve agotarse. */
const HOUSE_MADE: ReadonlySet<string> = new Set(productionRecipes.map((r) => r.resultado));

async function runTicket(
  services: HistoryServices,
  staff: { waiter: Principal; cashier: Principal; cook: Principal; manager: Principal },
  branchCode: string,
  branchId: string,
  shiftId: string,
  sellables: Sellable[],
  tables: string[],
  ids: MasterIds,
  key: string,
  rng: Rng,
  extras: TicketExtras,
): Promise<boolean> {
  const branch = branches.find((b) => b.codigo === branchCode)!;
  // Una reserva que llegó ya tiene mesa y la atiende el mesero.
  const modality = extras.seat ? 'MESA' : rng.weighted(Object.entries(branch.modalidades) as [string, number][]);
  const origin = extras.seat
    ? 'MESERO'
    : modality === 'MESA'
      ? rng.weighted([['MESERO', 70], ['QR', 30]] as const)
      : modality === 'DELIVERY'
        ? rng.weighted([['PLATAFORMA', 60], ['TELEFONO', 25], ['WEB', 15]] as const)
        : rng.weighted([['CAJA', 80], ['QUIOSCO', 20]] as const);

  const composed = composeTicket(sellables, rng, modality);
  const { needsFee } = composed;
  // Agotado: lo que se produce en casa y ya no alcanza no se vende. El cajero
  // ve el pan de banano o el atol agotados y el cliente pide lo demás; antes
  // se cobraba igual y la cocina terminaba cancelando la orden por merma. Si
  // todo lo que quería se acabó, se lleva un café de pichel.
  const reserved = new Map<string, number>();
  const lines: typeof composed.lines = [];
  for (const line of composed.lines) {
    const wants = new Map<string, number>();
    for (const c of saleRecipes.find((r) => r.sku === line.sellable.sku)?.componentes ?? []) {
      if (HOUSE_MADE.has(c.articulo))
        wants.set(c.articulo, (wants.get(c.articulo) ?? 0) + baseQty(c) * (1 + (c.merma ?? 0) / 100) * line.units);
    }
    const direct = products.flatMap((p) => p.variantes).find((v) => v.sku === line.sellable.sku)?.articulo;
    if (direct && HOUSE_MADE.has(direct)) wants.set(direct, (wants.get(direct) ?? 0) + line.units);
    let enough = true;
    for (const [articleCode, amount] of wants) {
      if ((await extras.onHand(articleCode)) + 1e-6 < (reserved.get(articleCode) ?? 0) + amount) enough = false;
    }
    if (!enough) continue;
    for (const [articleCode, amount] of wants) reserved.set(articleCode, (reserved.get(articleCode) ?? 0) + amount);
    lines.push(line);
  }
  if (!lines.length) {
    const fallback = sellables.find((s) => s.sku === 'SKU-PICHEL-8') ?? composed.lines[0].sellable;
    lines.push({ sellable: fallback, units: 1, mods: [] });
  }
  const items = lines.map((line) => ({
    varianteId: line.sellable.variantId,
    cantidad: qty(line.units),
    modificadores: line.mods.length
      ? line.mods.map((optionCode) => ({ modificadorId: ids.modifierOptions.get(optionCode)! }))
      : undefined,
  }));
  const fee = sellables.find((s) => s.sku === DELIVERY_FEE_SKU);
  if (needsFee && fee) items.push({ varianteId: fee.variantId, cantidad: '1', modificadores: undefined });

  const total =
    lines.reduce((sum, l) => sum + l.sellable.price * l.units, 0) + (needsFee && fee ? fee.price : 0);

  const payments = paymentsFor(total, modality, rng);
  const seated = modality === 'MESA' && (tables.length > 0 || !!extras.seat);
  // Un pedido QR de verdad: el comensal escanea, arma su carrito y lo manda a
  // cocina desde su teléfono, con la cuenta de autoservicio. Antes era el
  // mesero creando una orden con origen QR, que es exactamente lo que el
  // autoservicio existe para no necesitar.
  const viaQr = seated && origin === 'QR' && !extras.seat && extras.qr.length > 0;
  // Teléfono y web son clientes que la sucursal conoce: la orden queda en su
  // historial y la entrega va a su dirección registrada. La plataforma trae
  // a su propio cliente, que la sucursal no ve.
  const client =
    modality === 'DELIVERY' && origin !== 'PLATAFORMA' && extras.clients.length && rng.chance(0.75)
      ? rng.pick(extras.clients)
      : null;
  // quickCheckout no es un atajo universal: el store lo rechaza fuera de
  // mostrador y para llevar, con cualquier producto PREPARADO, y con una
  // transferencia, que queda pendiente de verificación y necesita el cobro
  // normal. Mandar todo por ahí costó quince tickets. Lo que no entra en esas
  // tres condiciones va por el camino largo, que es el que el sistema espera.
  const quick =
    (modality === 'MOSTRADOR' || modality === 'PARA_LLEVAR') &&
    !lines.some((l) => l.sellable.prepared) &&
    !payments.some((p) => p.metodo === 'TRANSFERENCIA');

  if (!quick) {
    // El camino largo, y el único que usa una cuenta: abrir con sus líneas,
    // cocinar, liquidar. Sirve para las cuatro modalidades.
    //
    // create() recibe las líneas y manda a cocina él mismo, así que el add()
    // que venía después no solo era de más: create() itera d.lineas sin
    // comprobarla, y al no mandarla fallaba con «d.lineas is not iterable» —
    // los 114 tickets. Y devuelve {orderId}, no {id}, el mismo tropiezo que
    // {shiftId}: leer .id dejaba undefined el resto de la cadena.
    const effective = seated ? modality : modality === 'MESA' ? 'MOSTRADOR' : modality;
    // Una orden a domicilio crea su entrega en la misma transacción, y eso
    // exige delivery.manage, que el cajero no tiene: la toma el gerente, que
    // es quien atiende el teléfono.
    const opener = effective === 'DELIVERY' ? staff.manager : seated ? staff.waiter : staff.cashier;
    let session: { sesionId: string; sucursalId: string; mesaId: string; ordenId: string | null } | null = null;
    let orderId: string;
    if (viaQr) {
      const spot = rng.pick(extras.qr);
      const access = (await services.selfService.access(spot.token)) as { sesionId: string; mesa: { id: string } };
      session = { sesionId: access.sesionId, sucursalId: branchId, mesaId: access.mesa.id, ordenId: null };
      // addItems abre la orden (MESA, origen QR) sin mandarla a cocina; el
      // envío es el botón «Enviar pedido», que va dentro del try de abajo.
      const cart = (await services.selfService.addItems(session, items)) as { ordenId: string | null };
      if (!cart?.ordenId) throw Error('El autoservicio no abrió la orden');
      session.ordenId = cart.ordenId;
      orderId = cart.ordenId;
    } else {
    // create() termina con `return this.detail(u, result.orderId)`, así que
    // devuelve la orden completa y la clave es `id`. Mi corrección anterior a
    // `.orderId` fue peor que el error: leí el return de createCoreTx y no el
    // de create.
    const created = (await services.orders.create(opener, {
      sucursalId: branchId,
      // Una mesa sin mesas configuradas se cobra en mostrador.
      modalidad: effective,
      origen: origin,
      lineas: items,
      enviarCocina: true,
      claveOperacion: `${key}-ORD`,
      ...(extras.seat
        ? { mesaId: extras.seat.mesaId, personas: extras.seat.personas }
        : seated
          ? { mesaId: rng.pick(tables), personas: rng.int(1, 4) }
          : {}),
      ...(extras.seat?.clienteId ? { clienteId: extras.seat.clienteId } : {}),
      ...(client ? { clienteId: client.id } : {}),
      // Una entrega sin dirección se rechaza, y los datos de entrega en
      // cualquier otra modalidad también.
      ...(effective === 'DELIVERY'
        ? {
            direccionTexto:
              client?.direccion ?? `${rng.pick(ADDRESSES)}, ${branch.nombre.split(' ').at(-1) ?? 'Centro'}`,
            telefonoContacto: client?.telefono ?? `5${rng.int(1000000, 9999999)}`,
            // Una orden que entra por plataforma tiene que decir por cuál: la
            // entrega encadenada la rechaza sin canalExternoId, y lo rechaza
            // también en cualquier otro origen.
            ...(origin === 'PLATAFORMA'
              ? {
                  canalExternoId: rng.pick([...ids.channels.values()]),
                  referenciaExterna: `EXT-${rng.int(100000, 999999)}`,
                }
              : {}),
          }
        : {}),
    })) as { id: string };
    orderId = created.id;
    }

    // Desde aquí hasta el cobro, un fallo deja la orden abierta — y el cierre
    // operativo del día se niega mientras quede una. En ocho semanas fueron
    // treinta y dos órdenes trabadas y cincuenta y cuatro días sin cerrar,
    // casi siempre porque a la cocina se le acabó el bizcocho a media tarde.
    // Un restaurante no deja la orden colgada: la cancela, con su motivo y su
    // clasificación. Eso desbloquea el día y además es la cancelación
    // supervisada operando, que el demo debería mostrar.
    let paid = false;
    try {
    if (session) await services.selfService.send(session);
    // The kitchen works the tickets the send created.
    // queue() lee q.page y q.limit sin valores por defecto, y devuelve
    // {data, meta, totals}: sin la paginación fallaba con «Argument `skip` is
    // missing», y filtrar sobre el objeto en vez de sobre .data no recorría
    // nada aunque hubiera respondido.
    const queued = (await services.kitchen
      .queue(staff.cook, { sucursalId: branchId, page: 1, limit: 50 })
      .catch((e) => (note('cola de cocina', e), null))) as { data?: { id: string; ordenId: string }[] } | null;
    for (const ticket of (queued?.data ?? []).filter((t) => t.ordenId === orderId)) {
      // Una sola llamada: readyDeliver(cocinero, comandaId, clave) prepara,
      // marca listo y entrega todas las líneas en una transacción serializable
      // e idempotente. Es la operación de entrega que el store ofrece para la
      // comanda completa.
      //
      // El intento anterior usaba tres pasos y el tercero estaba doblemente
      // mal, verificado contra kitchen.store: deliver(u, id) recibe el id de
      // una LÍNEA de comanda —hace comandaLinea.findUnique con él— y aquí se
      // le pasaba la comanda, así que respondía «Línea inexistente»; y lo
      // llamaba el mesero, que no tiene kitchen.manage. Cada ticket del
      // camino largo habría muerto en ese paso y cancelado su orden.
      //
      // El fallo sube en vez de anotarse y seguir: una comanda que la cocina
      // no puede preparar cancela la orden más abajo, no la deja abierta
      // bloqueando el cierre del día. Ciento quince órdenes quedaron así.
      try {
        await services.kitchen.readyDeliver(staff.cook, ticket.id, {
          claveOperacion: `${key}-COC-${ticket.id}`.slice(0, 120),
        });
      } catch (error) {
        note('cocina: preparar y entregar', error);
        throw error;
      }
    }
    // finalize() solo recibe la orden: liquida, no cobra. El cobro va contra
    // la cuenta, que create() abre junto con la orden, así que primero hay que
    // pedirla. Pasarle los pagos a finalize era inventar una firma.
    const accounts = (await services.accounts.accounts(staff.cashier, orderId)) as
      | { id: string; total: unknown; pagado: unknown }[]
      | null;
    const account = accounts?.[0];
    if (!account) throw Error('La orden no abrió cuenta');
    // Se cobra lo que dice la cuenta, no lo que sumaron mis líneas: el total
    // del servidor incluye los modificadores, el empaque y el servicio, así
    // que mi suma quedaba corta y la cuenta nunca estaba «exactamente pagada».
    const due = Number(account.total) - Number(account.pagado);
    const collected = (await services.accounts.collect(staff.cashier, account.id, {
      turnoId: shiftId,
      pagos: paymentParts(payments[0].metodo, due, rng),
      claveOperacion: `${key}-COB`,
    })) as { intentoIds?: string[] };
    paid = true;

    // Una entrega tiene su propio ciclo, y la orden no cierra hasta que esté
    // ENTREGADA: asignar repartidor, despachar, completar. Eran los ocho «La
    // entrega debe estar ENTREGADA antes de cerrar la orden».
    if (effective === 'DELIVERY') {
      const deliveries = (await services.delivery
        .list(staff.manager, { sucursalId: branchId, page: 1, limit: 10, ordenId: orderId })
        .catch((e) => (note('listar entregas', e), null))) as { data?: { id: string }[] } | null;
      const deliveryId = deliveries?.data?.[0]?.id;
      if (deliveryId) {
        await services.delivery
          .assign(staff.manager, deliveryId, {
            // El repartidor necesita delivery.courier o delivery.manage en la
            // sucursal, y el mesero no tiene ningún permiso de entregas: el
            // gerente sale a repartir. Si prefiere que el mesero reparta, el
            // cambio va en los permisos del rol, no aquí.
            repartidorId: staff.manager.id,
            claveOperacion: `${key}-ASG`,
          })
          .catch((e) => note('asignar repartidor', e));
        await services.delivery
          .dispatch(staff.manager, deliveryId, { claveOperacion: `${key}-DSP` })
          .catch((e) => note('despachar entrega', e));
        await services.delivery
          .complete(staff.manager, deliveryId, { claveOperacion: `${key}-ENT` })
          .catch((e) => note('completar entrega', e));
      }
    }

    // Una transferencia entra como intento pendiente, y mientras lo esté la
    // cuenta no se liquida, la orden no cierra y el cierre del día la encuentra
    // abierta. El cajero la verifica, que es el paso que el sistema espera y
    // que el demo debería mostrar.
    for (const [i, attemptId] of (collected?.intentoIds ?? []).entries()) {
      await services.accounts
        .confirm(staff.cashier, attemptId, {
          turnoId: shiftId,
          motivo: 'Transferencia verificada en banca en línea',
          claveOperacion: `${key}-VER${i}`,
        })
        .catch((e) => note('verificar transferencia', e));
    }
    // Una transferencia queda en intento pendiente, de modo que la cuenta
    // puede no liquidarse todavía: eso es parte de lo que el demo muestra.
    await services.accounts.finalize(staff.cashier, orderId).catch((e) => note('liquidar cuenta', e));
    await services.orders.close(staff.cashier, orderId).catch((e) => note('cerrar orden', e));
    // La mesa se pagó: la sesión del teléfono termina, como cuando el mesero
    // cobra y el comensal se va.
    if (session) await services.selfService.closeSession(session).catch((e) => note('cerrar sesión QR', e));
    return true;
    } catch (error) {
      // Cancelar exige que la cuenta no tenga pagos, así que solo se intenta
      // cuando el fallo fue antes de cobrar.
      if (!paid) {
        await services.orders
          .cancel(staff.manager, orderId, {
            motivo: `No se pudo completar: ${describe(error).split('\n')[0].slice(0, 180)}`,
            clasificacion: 'MERMA_OPERATIVA',
            claveOperacion: `${key}-CAN`,
          })
          .catch((e) => note('cancelar orden', e));
      }
      if (session) await services.selfService.closeSession(session).catch((e) => note('cerrar sesión QR', e));
      throw error;
    }
  }

  // Mostrador y para llevar sin preparados se cobran de un golpe, que es lo
  // que de verdad hace una fila en la caja.
  await services.orders.quickCheckout(staff.cashier, {
    sucursalId: branchId,
    modalidad: modality,
    origen: origin,
    turnoId: shiftId,
    lineas: items,
    pagos: payments,
    claveOperacion: `${key}-QCK`,
  });
  return true;
}

type Staff = { waiter: Principal; cashier: Principal; cook: Principal; keeper: Principal; manager: Principal };

/** Lo que cada sucursal arrastra por todo el mes. */
interface BranchContext {
  branch: (typeof branches)[number];
  branchId: string;
  sellables: Sellable[];
  tables: string[];
  qr: { mesaId: string; token: string }[];
  clients: CustomerRef[];
  registerId: string;
  staff: Staff;
}

/** Los clientes de la sucursal con su teléfono y su dirección principal. */
async function customersOf(db: Db, clientIds: string[]): Promise<CustomerRef[]> {
  if (!clientIds.length) return [];
  const rows = await db.cliente.findMany({
    where: { id: { in: clientIds }, activo: true },
    select: {
      id: true,
      nombre: true,
      telefono: true,
      direccionClientesComoCliente: { select: { direccion: true, principal: true, activa: true } },
    },
    orderBy: { nombre: 'asc' },
  });
  return rows.map((row) => {
    const addresses = row.direccionClientesComoCliente.filter((a) => a.activa);
    const main = addresses.find((a) => a.principal) ?? addresses[0];
    return { id: row.id, nombre: row.nombre, telefono: row.telefono, direccion: main?.direccion ?? null };
  });
}

/** Lo que sale de la caja chica de una cafetería: [categoría, descripción]. */
const PETTY_CASH: readonly (readonly [string, string])[] = [
  ['INSUMOS', 'Hielo de emergencia en la tienda de la esquina'],
  ['SERVICIOS', 'Recarga de gas propano para la estufa'],
  ['TRANSPORTE', 'Flete del mercado'],
  ['MANTENIMIENTO', 'Reparación menor de la licuadora'],
  ['LIMPIEZA', 'Escobas y trapeadores'],
  ['INSUMOS', 'Limones y hierbabuena del mercado'],
];

/**
 * Los minutos del día (hora local) en que entra cada ticket, en orden: la
 * curva de una cafetería, con el desayuno de las ocho y la tarde de las
 * cuatro, entre las 7:00 y las 18:45.
 */
function ticketTimes(count: number, clock: Rng): number[] {
  const hours = Object.entries(CAFE_HOURS).map(([h, w]) => [Number(h), w] as const);
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const hour = clock.weighted(hours);
    times.push(hour * 60 + clock.int(0, hour === 18 ? 45 : 59));
  }
  return times.sort((a, b) => a - b);
}

/**
 * Una sesión de autoservicio vence tres horas después de abrirse
 * (SESSION_TTL_MS en self-service.store). Se abrió ahora, así que su
 * vencimiento quedó en el futuro y el reajuste no lo alcanzó: una sesión del
 * día 3 se vería vigente hasta hoy. Se recalcula desde su creación ya movida.
 */
const SELF_SERVICE_TTL_MS = 3 * 60 * 60 * 1000;
async function alignSelfServiceExpiry(db: Db, mark: Date, until: Date): Promise<void> {
  const sessions = await db.sesionAutoservicio.findMany({
    where: { expiraEn: { gt: until }, creadaEn: { lt: mark } },
    select: { id: true, creadaEn: true },
  });
  for (const session of sessions) {
    await db.sesionAutoservicio.update({
      where: { id: session.id },
      data: { expiraEn: new Date(session.creadaEn.getTime() + SELF_SERVICE_TTL_MS) },
    });
  }
}

export async function runHistory(
  db: Db,
  services: HistoryServices,
  ids: MasterIds,
  options: DemoOptions,
  admin: Principal,
  restock?: (branchCode: string, week: number) => Promise<void>,
): Promise<Date> {
  const days = operationalDays(options.semanas);
  let totalSold = 0;
  names = new Map([
    ...[...ids.articles].map(([code, id]) => [id, code] as const),
    ...[...ids.variants].map(([sku, id]) => [id, sku] as const),
  ]);

  // Cada sucursal prepara su contexto una vez; el mes se recorre día por día
  // con las cuatro dentro. Antes era sucursal por sucursal: repostería vivía
  // su mes entero antes de que la cafetería abriera, y una requisición fechada
  // el día 10 se llevaba lotes que repostería produjo el día 27.
  const contexts: BranchContext[] = [];
  for (const branch of branches) {
    const branchId = ids.branches.get(branch.codigo);
    if (!branchId) continue;
    if (options.sucursales.length && !options.sucursales.includes(branch.codigo)) continue;

    const sellables = await sellablesFor(db, branch.codigo, ids);
    if (!sellables.length) {
      progress('historia', `${branch.codigo}: sin precios, se omite`);
      continue;
    }
    // Tres personas cubren todo: el cajero atiende mostrador y mesas, la
    // barista prepara, y la gerente produce, cuenta inventario, despacha
    // domicilios y paga los servicios.
    const people = ids.staff.get(branch.codigo)!;
    const cajero = asPrincipal(people.get('CAJERO')!, 'cajero@demo.local');
    const gerente = asPrincipal(people.get('ADMIN_SUCURSAL')!, 'gerente@demo.local');
    contexts.push({
      branch,
      branchId,
      sellables,
      tables: ids.tables.get(branch.codigo) ?? [],
      qr: ids.qrTokens.get(branch.codigo) ?? [],
      clients: await customersOf(db, ids.clients.get(branch.codigo) ?? []),
      registerId: [...(ids.registers.get(branch.codigo)?.values() ?? [])][0],
      staff: {
        waiter: cajero,
        cashier: cajero,
        cook: asPrincipal(people.get('COCINA')!, 'barista@demo.local'),
        keeper: gerente,
        manager: gerente,
      },
    });
  }
  // El gasto duplicado espera su reversa al día siguiente, y un asiento que ya
  // salió en un extracto no vuelve a salir en el siguiente.
  const duplicates = new Map<string, string>();
  const stated = new Set<string>();

  for (const [index, day] of days.entries()) {
    const dayKey = formatDay(day);
    for (const { branch, branchId, sellables, tables, qr, clients, registerId, staff } of contexts) {
      // A day already closed is a day already lived: this is the whole resume
      // mechanism, and it needs no file to go stale.
      const closed = await db.cierreOperativo.findFirst({
        where: { sucursalId: branchId, fechaOperativa: new Date(dayKey) },
      });
      if (closed) continue;

      // El reloj del día. Cada tramo de trabajo se fecha a su hora local en
      // Guatemala: el proveedor a las seis, la producción y la apertura antes
      // de las siete, cada ticket a su minuto entre las siete y las siete
      // menos cuarto, la caja chica a media jornada, el cierre por la tarde.
      // Antes el día entero se movía en bloque y sus veinticinco tickets
      // quedaban dentro del mismo minuto: un reporte por hora mostraba un pico.
      const back = (Date.parse(localDay()) - Date.parse(dayKey)) / 86400000;
      const clock = new Rng(0x71c7 + index * 61);
      const stamp = (from: Date, minutes: number, dates = false) =>
        shiftSince(
          db,
          from,
          back,
          Math.round((from.getTime() - localInstant(dayKey, minutes).getTime()) / 1000) - back * 86400,
          { dates },
        );

      const mark = new Date();
      // La semana abre comprando lo que falta, como un negocio. Corre aquí, en
      // la historia, para que el déficit se mida contra lo que de verdad quedó
      // tras la semana vendida; el proveedor entrega a primera hora.
      if (restock && index > 0 && index % 7 === 0) {
        await restock(branch.codigo, index / 7 + 1);
        await stamp(mark, 6 * 60 + clock.int(0, 15));
      }
      const rng = new Rng(0xc0ffee + index * 977 + branch.codigo.length * 31);
      const target = ticketsForDay(options.tickets, day.getUTCDay(), rng);
      const weekday = day.getUTCDay();
      // Separado del rng del día: los flujos que no son venta no deben mover la
      // secuencia de tickets y producción que la simulación validó.
      const side = new Rng(0x0b5e7 + index * 131 + branch.codigo.length * 17);

      // La producción de la mañana, antes de abrir.
      const producedAt = new Date();
      const batches = await runProduction(db, services, staff.keeper, branch.codigo, ids, dayKey, rng, index === 0, target, sellables);
      await stamp(producedAt, 6 * 60 + 20 + clock.int(0, 10));

      // open() devuelve {shiftId}, no {id}. Leerlo como .id dejaba turnoId en
      // undefined en todo lo que viene después: los cobros, el gasto de caja y
      // el cierre del turno.
      const openedAt = new Date();
      let shift: { shiftId: string } | null = null;
      try {
        shift = (await services.cash.open(staff.cashier, {
          cajaId: registerId,
          fondoInicial: '500.00',
          claveOperacion: `DEMO-TURNO-${branch.codigo}-${dayKey}`,
        })) as { shiftId: string };
        if (!shift?.shiftId) throw Error('cash.open no devolvió shiftId');
      } catch (error) {
        note('apertura de turno', error);
        progress('historia', `${branch.codigo} ${dayKey}: no abrió turno, se omite el día`);
        continue;
      }
      await stamp(openedAt, 6 * 60 + 50 + clock.int(0, 5));

      const locationId = ids.locations.get(branch.codigo)!;
      const onHand = async (articleCode: string): Promise<number> => {
        const total = await db.existencia.aggregate({
          where: { ubicacionId: locationId, articuloId: ids.articles.get(articleCode)! },
          _sum: { cantidad: true },
        });
        return Number(total._sum.cantidad ?? 0);
      };

      // Cada ticket a su minuto, en orden: el número de orden y la hora
      // avanzan juntos.
      const times = ticketTimes(target, clock);
      let sold = 0;
      for (let n = 0; n < target; n++) {
        const key = `DEMO-${branch.codigo}-${dayKey}-${n}`;
        const at = new Date();
        try {
          if (await runTicket(services, staff, branch.codigo, branchId, shift!.shiftId, sellables, tables, ids, key, rng, { qr, clients, onHand }))
            sold++;
        } catch (error) {
          // A ticket that cannot be served — an ingredient ran out mid-service —
          // is part of what the demo should show, not a failure of the run.
          note('ticket', error);
        }
        await stamp(at, times[n]);
      }

      // La caja chica: gas, hielo de emergencia, un flete. Lo registra el
      // cajero contra su turno, a media jornada. El operationId lo emite el
      // servicio financiero, atado al actor, la sucursal y la acción.
      if (rng.chance(0.3)) {
        const spentAt = new Date();
        const intent = (await services.finance
          .issueIntent(staff.cashier, { sucursalId: branchId, accion: 'FIN_EXPENSE_CREATE' })
          .catch((e: unknown) => (note('intención de gasto', e), null))) as
          | { operationId: string }
          | null;
        if (intent) {
          const [categoria, descripcion] = rng.pick(PETTY_CASH);
          await services.finance
            .createExpense(staff.cashier, {
              sucursalId: branchId,
              origen: 'CAJA',
              turnoId: shift!.shiftId,
              categoria,
              descripcion,
              // Acotado a lo que cabe en la caja: el fondo inicial son Q500.
              monto: money(rng.int(25, 150)),
              operationId: intent.operationId,
            })
            .catch((e) => note('gasto de caja', e));
        }
        await stamp(spentAt, clock.int(10 * 60, 16 * 60));
      }

      // Al final de la jornada: consumo interno, el conteo del domingo, los
      // servicios del mes y, a mitad y a fin de período, el extracto.
      const eveningAt = new Date();
      await internalConsumption(services, ids, branch.codigo, staff.keeper, dayKey, side, note);
      await endOfDayWaste(db, services, ids, branch.codigo, staff.keeper, dayKey, note);
      if (weekday === 0) {
        await weeklyCount(db, services, ids, branch.codigo, staff.keeper, side).catch((e) =>
          note('conteo físico', e),
        );
      }
      await monthlyBills(services, ids, branch.codigo, branchId, staff.manager, admin, index, dayKey, side, duplicates, note);
      const midMonth = index === 14 && days.length > 15;
      const monthEnd = index === days.length - 1;
      if (midMonth || monthEnd) {
        try {
          const statement = await bankStatement(
            db, services, ids, branch.codigo, branchId, admin, mark, dayKey,
            `E${dayKey.replace(/-/g, '').slice(2)}`, monthEnd, stated, note,
          );
          progress('historia', `${branch.codigo} ${dayKey}: extracto de ${statement.lines} líneas, ${statement.matched} conciliadas`);
        } catch (error) {
          note('extracto bancario', error);
        }
      }
      await stamp(eveningAt, 18 * 60 + 50 + clock.int(0, 5));

      // El cierre de caja. Es el tramo que mueve también las columnas de solo
      // fecha —el día operativo del turno, la emisión de las facturas, la
      // elaboración de los lotes—: hasta aquí el turno tenía que seguir siendo
      // de hoy, porque cobrar y gastar contra él comparan con la fecha real.
      // Cerrarlo no compara, y el cierre del día que sigue necesita encontrarlo
      // ya en su día para resumirlo.
      const closingAt = new Date();
      await services.cash
        .close(staff.cashier, shift!.shiftId, {
          // Counted cash drifts from expected by a few quetzales, which is what
          // a cash-difference report exists to show.
          efectivoContado: money(500 + sold * rng.float(10, 26) + rng.float(-12, 8)),
          notaCierre: 'Cierre de turno',
          claveOperacion: `DEMO-CIERRE-${branch.codigo}-${dayKey}`,
        })
        // Hiding this one cost the whole week: with the shift left open, every
        // later day failed to open one and was skipped.
        .catch((e) => note('cierre de turno', e));
      await stamp(closingAt, 19 * 60 + 5 + clock.int(0, 5), true);

      // El cierre del día lo firma el dueño. Su resumen suma por rango de horas
      // del día —ventas, pagos, gastos, movimientos de banco— y por turnos con
      // ese día operativo: con cada cosa ya en su hora, el resumen guardado
      // trae los montos reales del día.
      // FinanceClosingService exposes confirm(); the controller's close()
      // route is just its HTTP name.
      const confirmAt = new Date();
      const closeIntent = (await services.finance
        .issueIntent(admin, { sucursalId: branchId, accion: 'FIN_DAY_CLOSE' })
        .catch((e: unknown) => (note('intención de cierre', e), null))) as
        | { operationId: string }
        | null;
      if (closeIntent) {
        await services.closing
          .confirm(admin, {
            sucursalId: branchId,
            fechaOperativa: dayKey,
            operationId: closeIntent.operationId,
          })
          .catch((e) => note('cierre operativo', e));
      }
      await stamp(confirmAt, 19 * 60 + 20 + clock.int(0, 10));
      await alignSelfServiceExpiry(db, mark, new Date());
      totalSold += sold;
      progress('historia', `${branch.codigo} ${dayKey}: ${sold}/${target} tickets, ${batches} lotes`);
    }
  }

  // Hoy. La historia termina ayer por la noche; la demo se abre hoy, y el
  // cajero tiene que poder vender en vivo: llega la reposición de la semana y
  // la gerente hace la producción de la mañana —el atol fresco, el pan de
  // banano, los jarabes—, con el reloj de hoy, sin moverlo. El turno de caja
  // se deja cerrado: abrirlo es lo primero que se muestra.
  const todayFrom = new Date();
  for (const { branch, staff, sellables } of contexts) {
    if (restock) await restock(branch.codigo, Math.floor(days.length / 7) + 1);
    const batches = await runProduction(
      db, services, staff.keeper, branch.codigo, ids, localDay(), new Rng(0x70da7),
      true, Math.round(options.tickets * 1.5), sellables,
    );
    progress('historia', `${branch.codigo} hoy: reposición recibida y ${batches} lotes producidos, lista para vender`);
  }

  const reported = historyFailures();
  if (reported.length) {
    process.stderr.write(
      `\nFallos tolerados durante la historia (${totalSold} tickets vendidos):\n` +
        reported.join('\n') +
        '\n',
    );
  }
  // A demonstration with no sales is not a demonstration, and until now it
  // finished quietly and said "listo". The phase is only done if it sold.
  if (!totalSold) {
    throw Error(
      'La historia no vendió un solo ticket. Las causas están arriba, agrupadas: ' +
        'el demo no sirve sin operación, así que esto se trata como un fallo.',
    );
  }
  return todayFrom;
}
