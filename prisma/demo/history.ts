/**
 * Eight weeks of operation, driven through the real services.
 *
 * Every ticket here is created, sent to the kitchen, prepared, charged and
 * closed by the same code the app calls, so the stock it consumed, the cost
 * layers it drew from and the margin it produced are the system's own
 * arithmetic. That is the whole reason this phase is slow.
 *
 * Each simulated day is written at today's clock and then moved back as a
 * unit, which keeps the order of events inside the day intact — see
 * backdate.ts for why the clock cannot simply be told what to say.
 *
 * Resuming needs no state file: a day whose CierreOperativo exists is a day
 * already lived, so the phase skips it.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { Principal } from '../../src/modules/auth/application/auth.service.js';
import { articles } from './articles.js';
import { modifierGroups, products } from './products.js';
import { branches, menus } from './branches.js';
import { productionRecipes, saleRecipes } from './recipes.js';
import { shiftSince } from './backdate.js';
import {
  batchChance,
  formatDay,
  operationalDays,
  progress,
  Rng,
  ticketsForDay,
  type DemoOptions,
} from './runtime.js';
import type { MasterIds } from './masters.js';

type Db = PrismaClient;
type Service = Record<string, (...args: any[]) => Promise<any>>;

/** The services this phase drives, pulled from the Nest context by the caller. */
export interface HistoryServices {
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
export function composeTicket(sellables: Sellable[], rng: Rng, modality: string) {
  const lineCount = rng.weighted([[1, 32], [2, 34], [3, 20], [4, 9], [5, 5]] as const);
  const chosen: { sellable: Sellable; units: number; mods: string[] }[] = [];
  for (let i = 0; i < lineCount; i++) {
    const sellable = rng.weighted(sellables.map((s) => [s, s.weight] as const));
    if (chosen.some((c) => c.sellable.sku === sellable.sku)) continue;
    const mods: string[] = [];
    for (const groupCode of sellable.modifierGroups) {
      const group = modifierGroups.find((g) => g.codigo === groupCode)!;
      // A required group always resolves; optional ones are the exception a
      // customer asks for, not the rule.
      if (group.minimo > 0) mods.push(rng.pick(group.opciones).codigo);
      else if (rng.chance(0.22)) mods.push(rng.pick(group.opciones).codigo);
    }
    chosen.push({
      sellable,
      units: rng.weighted([[1, 78], [2, 16], [3, 6]] as const),
      mods,
    });
  }
  if (!chosen.length) chosen.push({ sellable: rng.pick(sellables), units: 1, mods: [] });
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
  // Qué se hace hoy, y cuánto.
  //
  // El primer día se hacen todas, sin sorteo: un jarabe de vainilla dura
  // semanas, así que su probabilidad diaria es del doce por ciento, y una
  // cafetería que vende lattes desde el primer día se quedaba pidiendo un
  // jarabe que no se había hecho nunca. Una preparación tiene que existir
  // antes de poder venderse.
  //
  // Y la cantidad no puede ser una tanda fija. Un bizcocho rinde 1900 g y un
  // pastel pide 1260, lo cual alcanza — pero el bizcocho se produce con el
  // cuarenta por cien que le da su vida útil de cuatro días, y el pastel con
  // el ochenta y cinco de la suya, de tres. El padre corría más seguido que el
  // hijo. Así que primero se decide qué se produce, después se baja la cuenta
  // de lo que cada padre necesita, y recién entonces se produce: tanto
  // bizcocho como pidan los pasteles de hoy, que es como trabaja una
  // pastelería.
  /** Lo que el mostrador consume hoy de una preparación, rebanada por rebanada. */
  const offeredSkus = new Set(
    branch.menus.flatMap((c) => menus.find((m) => m.codigo === c)!.secciones.flatMap((sec) => sec.skus)),
  );
  const sold = (articleCode: string): number => {
    let units = 0;
    for (const sku of offeredSkus) {
      for (const component of saleRecipes.find((r) => r.sku === sku)?.componentes ?? []) {
        if (component.articulo !== articleCode) continue;
        units += (tickets * 2 * component.cantidad * (1 + (component.merma ?? 0) / 100)) / offeredSkus.size;
      }
    }
    return units * 1.3;
  };

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

  const plan = new Map<string, number>();
  for (const articleCode of [...ordered].reverse()) {
    const recipe = productionRecipes.find((r) => r.resultado === articleCode)!;
    const shelfLife = recipe.vidaUtilDias ?? 30;
    const have = onHand.get(ids.articles.get(articleCode)!) ?? 0;
    // Lo que hoy va a hacer falta: lo que consumen las producciones de arriba
    // más lo que el mostrador va a vender de esto mismo.
    const demand = (plan.get(articleCode) ?? 0) + sold(articleCode);
    const batch =
      first || rng.chance(batchChance(shelfLife)) ? recipe.rendimiento * rng.float(0.8, 1.3) : 0;
    // Se hornea el faltante, y si el dado dijo que hoy toca, al menos una
    // tanda. Lo que sobra de ayer cuenta: así un jarabe que dura semanas no se
    // vuelve a hacer hasta que se acaba, y el bizcocho se hace todos los días.
    const make = Math.max(batch, demand - have);
    if (make <= 0) continue;
    plan.set(articleCode, make);
    // Lo que esta producción va a consumir, para quien lo produce. Va la
    // cantidad que de verdad se va a hornear, no la que se planeó antes de
    // sumarle el mostrador: ahí estaba el desfase que dejaba al pastel
    // pidiendo más bizcocho del que se había pedido para él.
    const batchesOf = make / recipe.rendimiento;
    for (const component of recipe.componentes) {
      if (!productionRecipes.some((r) => r.resultado === component.articulo)) continue;
      const needs = batchesOf * component.cantidad * (1 + (component.merma ?? 0) / 100);
      plan.set(component.articulo, (plan.get(component.articulo) ?? 0) + needs);
    }
  }

  for (const articleCode of ordered) {
    const planned = plan.get(articleCode);
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
): Promise<boolean> {
  const branch = branches.find((b) => b.codigo === branchCode)!;
  const modality = rng.weighted(Object.entries(branch.modalidades) as [string, number][]);
  const origin =
    modality === 'MESA'
      ? rng.weighted([['MESERO', 70], ['QR', 30]] as const)
      : modality === 'DELIVERY'
        ? rng.weighted([['PLATAFORMA', 60], ['TELEFONO', 25], ['WEB', 15]] as const)
        : rng.weighted([['CAJA', 80], ['QUIOSCO', 20]] as const);

  const { lines, needsFee } = composeTicket(sellables, rng, modality);
  const items = lines.map((line) => ({
    varianteId: line.sellable.variantId,
    cantidad: qty(line.units),
    modificadores: line.mods.length
      ? line.mods.map((optionCode) => ({ modificadorId: ids.modifierOptions.get(optionCode)! }))
      : undefined,
  }));
  const fee = sellables.find((s) => s.sku === 'SKU-SERVICIO-DOMICILIO');
  if (needsFee && fee) items.push({ varianteId: fee.variantId, cantidad: '1', modificadores: undefined });

  const total =
    lines.reduce((sum, l) => sum + l.sellable.price * l.units, 0) + (needsFee && fee ? fee.price : 0);

  const payments = paymentsFor(total, modality, rng);
  const seated = modality === 'MESA' && tables.length > 0;
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
      ...(seated ? { mesaId: rng.pick(tables), personas: rng.int(1, 4) } : {}),
      // Una entrega sin dirección se rechaza, y los datos de entrega en
      // cualquier otra modalidad también.
      ...(effective === 'DELIVERY'
        ? {
            direccionTexto: `${rng.pick(ADDRESSES)}, ${branch.nombre.split(' ').at(-1) ?? 'Centro'}`,
            telefonoContacto: `5${rng.int(1000000, 9999999)}`,
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
    const orderId = created.id;

    // Desde aquí hasta el cobro, un fallo deja la orden abierta — y el cierre
    // operativo del día se niega mientras quede una. En ocho semanas fueron
    // treinta y dos órdenes trabadas y cincuenta y cuatro días sin cerrar,
    // casi siempre porque a la cocina se le acabó el bizcocho a media tarde.
    // Un restaurante no deja la orden colgada: la cancela, con su motivo y su
    // clasificación. Eso desbloquea el día y además es la cancelación
    // supervisada operando, que el demo debería mostrar.
    let paid = false;
    try {
    // The kitchen works the tickets the send created.
    // queue() lee q.page y q.limit sin valores por defecto, y devuelve
    // {data, meta, totals}: sin la paginación fallaba con «Argument `skip` is
    // missing», y filtrar sobre el objeto en vez de sobre .data no recorría
    // nada aunque hubiera respondido.
    const queued = (await services.kitchen
      .queue(staff.cook, { sucursalId: branchId, page: 1, limit: 50 })
      .catch((e) => (note('cola de cocina', e), null))) as { data?: { id: string; ordenId: string }[] } | null;
    for (const ticket of (queued?.data ?? []).filter((t) => t.ordenId === orderId)) {
      // Tres pasos, y los tres tienen que subir su fallo.
      //
      // ready() deja la comanda LISTA, no entregada, y mientras una línea
      // siga sin entregar la cuenta no liquida, la orden no cierra y el día
      // tampoco. El paso de entrega faltaba — lo dije arreglado dos rondas
      // atrás y la edición nunca entró al commit.
      //
      // Y estos fallos se anotaban y seguían, así que un plato que la cocina
      // no podía preparar dejaba su comanda pendiente mientras el ticket se
      // contaba como vendido. Ciento quince órdenes abiertas para siempre.
      // Ahora el fallo sube y la orden se cancela, que es lo que hace una
      // cocina cuando no puede servir un plato.
      const step = async (label: string, run: Promise<unknown>): Promise<void> => {
        try {
          await run;
        } catch (error) {
          note(label, error);
          throw error;
        }
      };
      await step('cocina: iniciar', services.kitchen.start(staff.cook, ticket.id));
      await step('cocina: listo', services.kitchen.ready(staff.cook, ticket.id));
      await step('cocina: entregar', services.kitchen.deliver(staff.waiter, ticket.id));
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

export async function runHistory(
  db: Db,
  services: HistoryServices,
  ids: MasterIds,
  options: DemoOptions,
  admin: Principal,
): Promise<void> {
  const days = operationalDays(options.semanas);
  const today = new Date();
  let totalSold = 0;
  names = new Map([
    ...[...ids.articles].map(([code, id]) => [id, code] as const),
    ...[...ids.variants].map(([sku, id]) => [id, sku] as const),
  ]);

  for (const branch of branches) {
    const branchId = ids.branches.get(branch.codigo);
    if (!branchId) continue;
    if (options.sucursales.length && !options.sucursales.includes(branch.codigo)) continue;

    const sellables = await sellablesFor(db, branch.codigo, ids);
    if (!sellables.length) {
      progress('historia', `${branch.codigo}: sin precios, se omite`);
      continue;
    }
    const tables = ids.tables.get(branch.codigo) ?? [];
    const people = ids.staff.get(branch.codigo)!;
    const staff = {
      waiter: asPrincipal(people.get('MESERO')!, `mesero.${branch.codigo.toLowerCase()}@demo.local`),
      cashier: asPrincipal(people.get('CAJERO')!, `cajero.${branch.codigo.toLowerCase()}@demo.local`),
      cook: asPrincipal(people.get('COCINA')!, `cocina.${branch.codigo.toLowerCase()}@demo.local`),
      keeper: asPrincipal(people.get('ALMACEN')!, `almacen.${branch.codigo.toLowerCase()}@demo.local`),
      manager: asPrincipal(people.get('ADMIN_SUCURSAL')!, `gerente.${branch.codigo.toLowerCase()}@demo.local`),
    };
    const registerId = [...(ids.registers.get(branch.codigo)?.values() ?? [])][0];

    for (const [index, day] of days.entries()) {
      const dayKey = formatDay(day);
      // A day already closed is a day already lived: this is the whole resume
      // mechanism, and it needs no file to go stale.
      const closed = await db.cierreOperativo.findFirst({
        where: { sucursalId: branchId, fechaOperativa: new Date(dayKey) },
      });
      if (closed) continue;

      const mark = new Date();
      const rng = new Rng(0xc0ffee + index * 977 + branch.codigo.length * 31);
      const target = ticketsForDay(options.tickets, day.getUTCDay(), rng);

      // open() devuelve {shiftId}, no {id}. Leerlo como .id dejaba turnoId en
      // undefined en todo lo que viene después: los cobros, el gasto de caja y
      // el cierre del turno. El cierre fallaba, el turno quedaba abierto, y los
      // seis días siguientes no podían abrir uno. Los servicios se exponen con
      // firmas any, así que TypeScript no tenía nada que objetar.
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

      const batches = await runProduction(db, services, staff.keeper, branch.codigo, ids, dayKey, rng, index === 0, target);

      let sold = 0;
      for (let n = 0; n < target; n++) {
        const key = `DEMO-${branch.codigo}-${dayKey}-${n}`;
        try {
          if (await runTicket(services, staff, branch.codigo, branchId, shift!.shiftId, sellables, tables, ids, key, rng))
            sold++;
        } catch (error) {
          // A ticket that cannot be served — an ingredient ran out mid-service —
          // is part of what the demo should show, not a failure of the run.
          note('ticket', error);
        }
      }

      if (rng.chance(0.3)) {
        // El operationId no se inventa: lo emite el servicio financiero y queda
        // atado al actor, la sucursal y la acción. Un `FIN:<uuid>` propio no
        // corresponde a ninguna intención registrada y se rechaza.
        // Lo registra el cajero, no el administrador: el turno es suyo.
        const intent = (await services.finance
          .issueIntent(staff.cashier, { sucursalId: branchId, accion: 'FIN_EXPENSE_CREATE' })
          .catch((e: unknown) => (note('intención de gasto', e), null))) as
          | { operationId: string }
          | null;
        if (intent) {
          await services.finance
            .createExpense(staff.cashier, {
              sucursalId: branchId,
              // Paid out of the till, which is what ties the expense to the
              // shift and makes it show up in the day's cash difference.
              origen: 'CAJA',
              turnoId: shift!.shiftId,
              categoria: rng.pick(['SERVICIOS', 'MANTENIMIENTO', 'LIMPIEZA', 'TRANSPORTE']),
              descripcion: rng.pick(['Pago de energía', 'Mantenimiento de equipo', 'Insumos de limpieza', 'Flete de proveedor']),
                // Acotado a lo que cabe en la caja: el fondo inicial son Q500 y
              // las ventas del día apenas suman, así que un gasto de Q900 se
              // rechaza por efectivo insuficiente.
              monto: money(rng.int(25, 150)),
              operationId: intent.operationId,
            })
            .catch((e) => note('gasto operativo', e));
        }
      }

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

      // FinanceClosingService exposes confirm(); the controller's close()
      // route is just its HTTP name.
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

      // Move the whole day back as a unit, preserving the order within it.
      const back = Math.round((today.getTime() - day.getTime()) / 86400000);
      await shiftSince(db, mark, back, -rng.int(0, 3600 * 6));
      totalSold += sold;
      progress('historia', `${branch.codigo} ${dayKey}: ${sold}/${target} tickets, ${batches} lotes`);
    }
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
}
