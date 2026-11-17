/**
 * La operación de un día que no es vender: lo que el personal registra en
 * Inventario y en Reservas. Cada función recorre el mismo servicio que la
 * pantalla correspondiente, con el rol que la usa en una sucursal real.
 *
 * Firmas leídas de los stores, no supuestas:
 *  - SupplyService: create(gerente destino) → send(almacén origen, con lote
 *    por línea si el artículo lo exige) → receive(almacén destino, por id de
 *    línea de transferencia) → cancel(gerente destino) para el saldo.
 *  - InventoryInternalConsumptionService.execute: solo SUMINISTRO o EMPAQUE;
 *    la clave es la del movimiento, única en todo el kardex.
 *  - InventoryOperationsService.createCount/confirmCount: un conteo por encima
 *    del teórico exige costo y inventory.costs.manage, que el almacenista no
 *    tiene; las diferencias de un conteo real de cierre son merma, no sobrante.
 *  - ReservationsService: el inicio no puede estar en el pasado y la llegada
 *    se registra desde 30 minutos antes, ambos contra el reloj real. Por eso la
 *    reserva del día se crea a minutos de ahora y la historia mueve su horario
 *    junto con el resto del día. NO_ASISTIO exige 15 minutos reales después
 *    del inicio: no se fabrica, porque esperar o forzar el reloj sería mentir.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { Principal } from '../../src/modules/auth/application/auth.service.js';
import { articles, INTERNAL_USE } from './articles.js';
import type { MasterIds } from './masters.js';
import type { Rng } from './runtime.js';

type Db = PrismaClient;
type Service = Record<string, (...args: any[]) => Promise<any>>;
type Note = (step: string, error: unknown) => void;

export interface OperationsServices {
  /** SupplyService: requisiciones entre sucursales. */
  supply: Service;
  /** InventoryInternalConsumptionService. */
  consumption: Service;
  /** InventoryOperationsService: conteos físicos. */
  inventoryOps: Service;
  /** ReservationsService. */
  reservations: Service;
}

export interface CustomerRef {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
}

/** La mesa de una reserva que llegó, para que la historia le sirva su orden. */
export interface Seat {
  mesaId: string;
  personas: number;
  clienteId: string | null;
}

const qtyText = (value: number): string => String(Math.max(0, Math.floor(value)));

/** Lotes con existencia, vigentes y sin bloqueo, el que vence primero adelante. */
async function freshLots(db: Db, locationId: string, articleId: string) {
  const rows = await db.existencia.findMany({
    where: { ubicacionId: locationId, articuloId: articleId, cantidad: { gt: 0 } },
    select: { loteId: true, cantidad: true, lote: { select: { fechaVencimiento: true, bloqueado: true } } },
  });
  // Un día de margen: el motor rechaza consumir de un lote vencido a la fecha
  // de hoy, y el envío se registra hoy antes de que el reloj se ajuste.
  const horizon = Date.now() + 86400000;
  return rows
    .filter((r) => !r.lote?.bloqueado && (!r.lote?.fechaVencimiento || r.lote.fechaVencimiento.getTime() > horizon))
    .sort(
      (a, b) =>
        (a.lote?.fechaVencimiento?.getTime() ?? Infinity) - (b.lote?.fechaVencimiento?.getTime() ?? Infinity),
    );
}

/**
 * Martes y viernes la cafetería pide bizcocho a repostería para sus rebanadas,
 * tres leches y brownies. Repostería envía hasta la mitad de lo que tiene —no
 * se queda sin producto para su propio mostrador—, la cafetería recibe, y si
 * lo enviado no cubrió lo pedido el gerente cierra el saldo con su motivo: la
 * pantalla muestra las tres salidas posibles de una requisición.
 */
const REQUISITION_ARTICLES = ['PRE-BIZCOCHO-CHOCOLATE', 'PRE-BIZCOCHO-VAINILLA'] as const;

export async function pastryRequisition(
  db: Db,
  services: OperationsServices,
  ids: MasterIds,
  cafe: { manager: Principal; keeper: Principal },
  pastry: { keeper: Principal },
  dayKey: string,
  rng: Rng,
  note: Note,
): Promise<void> {
  const key = `DEMO-REQ-CAF-${dayKey}`;
  const destWarehouse = ids.warehouses.get('CAFETERIA');
  const destLocation = ids.locations.get('CAFETERIA');
  const originWarehouse = ids.warehouses.get('REPOSTERIA');
  const originLocation = ids.locations.get('REPOSTERIA');
  if (!destWarehouse || !destLocation || !originWarehouse || !originLocation) return;

  const asked = REQUISITION_ARTICLES.map((articleCode) => ({
    articleCode,
    articuloId: ids.articles.get(articleCode)!,
    grams: rng.int(10, 20) * 100,
  }));

  const request = (await services.supply.create(cafe.manager, {
    almacenDestinoId: destWarehouse,
    nota: 'Bizcocho para rebanadas, tres leches y brownies',
    lineas: asked.map((a) => ({ articuloId: a.articuloId, cantidadSolicitada: String(a.grams) })),
    claveOperacion: `${key}-SOL`,
  })) as { id: string };

  // Lo que se envía sale de los lotes reales de repostería: el artículo lleva
  // lote y send() rechaza una línea sin él.
  const lines: { articuloId: string; ubicacionOrigenId: string; ubicacionDestinoId: string; loteId?: string; cantidad: string }[] = [];
  for (const a of asked) {
    const lots = await freshLots(db, originLocation, a.articuloId);
    const available = lots.reduce((sum, l) => sum + Number(l.cantidad), 0);
    let pending = Math.min(a.grams, Math.floor(available * 0.5));
    for (const lot of lots) {
      if (pending <= 0) break;
      const take = Math.min(pending, Math.floor(Number(lot.cantidad)));
      if (take <= 0) continue;
      lines.push({
        articuloId: a.articuloId,
        ubicacionOrigenId: originLocation,
        ubicacionDestinoId: destLocation,
        ...(lot.loteId ? { loteId: lot.loteId } : {}),
        cantidad: qtyText(take),
      });
      pending -= take;
    }
  }

  if (!lines.length) {
    await services.supply.cancel(cafe.manager, request.id, {
      motivo: 'Repostería sin bizcocho disponible para enviar hoy',
      claveOperacion: `${key}-CAN`,
    });
    return;
  }

  const transfer = (await services.supply.send(pastry.keeper, request.id, {
    almacenOrigenId: originWarehouse,
    nota: 'Envío a cafetería',
    lineas: lines,
    claveOperacion: `${key}-ENV`,
  })) as { id: string };

  const sent = await db.transferenciaInventarioLinea.findMany({
    where: { transferenciaId: transfer.id },
    select: { id: true, cantidadEnviada: true },
  });
  await services.supply.receive(cafe.keeper, transfer.id, {
    observaciones: 'Recibido completo y en buen estado',
    lineas: sent.map((l) => ({ transferenciaLineaId: l.id, cantidadRecibida: l.cantidadEnviada.toFixed() })),
    claveOperacion: `${key}-REC`,
  });

  // Atendida en parte: el saldo no se va a enviar, y una requisición abierta
  // para siempre no es lo que un gerente deja.
  const after = await db.requisicion.findUnique({ where: { id: request.id }, select: { estado: true } });
  if (after?.estado === 'ABIERTA') {
    await services.supply
      .cancel(cafe.manager, request.id, {
        motivo: 'Atendida en parte; el saldo lo produce la cafetería',
        claveOperacion: `${key}-SAL`,
      })
      .catch((e) => note('cerrar saldo de requisición', e));
  }
}

/** El gasto diario de suministros, registrado por el almacenista. */
export async function internalConsumption(
  services: OperationsServices,
  ids: MasterIds,
  branchCode: string,
  keeper: Principal,
  dayKey: string,
  rng: Rng,
  note: Note,
): Promise<number> {
  const locationId = ids.locations.get(branchCode);
  if (!locationId) return 0;
  let recorded = 0;
  for (const [articleCode, use] of Object.entries(INTERNAL_USE)) {
    const unit = articles.find((a) => a.codigo === articleCode)!.unidad;
    const amount =
      use.porDia < 1
        ? rng.chance(use.porDia)
          ? 1
          : 0
        : unit === 'ML' || unit === 'G'
          ? Math.round((use.porDia * rng.float(0.8, 1.2)) / 10) * 10
          : Math.max(1, Math.round(use.porDia * rng.float(0.8, 1.2)));
    if (amount <= 0) continue;
    try {
      await services.consumption.execute(keeper, {
        articuloId: ids.articles.get(articleCode)!,
        ubicacionId: locationId,
        cantidad: String(amount),
        destinoUso: use.destino,
        motivo: use.motivo,
        claveOperacion: `DEMO-CI-${branchCode}-${dayKey}-${articleCode}`,
      });
      recorded++;
    } catch (error) {
      note('consumo interno', error);
    }
  }
  return recorded;
}

/**
 * El conteo cíclico del domingo: diez posiciones al azar, la mayoría cuadran
 * y tres muestran una merma pequeña. Confirmarlo genera el ajuste y sus
 * salidas en el kardex, que es lo que el reporte de diferencias lee.
 */
export async function weeklyCount(
  db: Db,
  services: OperationsServices,
  ids: MasterIds,
  branchCode: string,
  keeper: Principal,
  rng: Rng,
): Promise<number> {
  const warehouseId = ids.warehouses.get(branchCode);
  const locationId = ids.locations.get(branchCode);
  if (!warehouseId || !locationId) return 0;
  const horizon = Date.now() + 86400000;
  const positions = (
    await db.existencia.findMany({
      where: { ubicacionId: locationId, cantidad: { gt: 0 } },
      select: {
        articuloId: true,
        loteId: true,
        cantidad: true,
        lote: { select: { fechaVencimiento: true } },
      },
      orderBy: [{ articuloId: 'asc' }, { loteId: 'asc' }],
    })
  ).filter((p) => !p.lote?.fechaVencimiento || p.lote.fechaVencimiento.getTime() > horizon);
  if (!positions.length) return 0;

  const picked = positions
    .map((p) => ({ p, order: rng.float(0, 1) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map(({ p }) => p);
  const lines = picked.map((p, i) => {
    // Lo exacto se pasa tal como está en la base: redondear el teórico a tres
    // decimales podía dejar el contado por encima, y eso es un sobrante.
    const shrink = i < 3 ? rng.float(0.01, 0.05) : 0;
    const counted = shrink ? qtyText(Number(p.cantidad) * (1 - shrink)) : p.cantidad.toFixed();
    return {
      articuloId: p.articuloId,
      ubicacionId: locationId,
      ...(p.loteId ? { loteId: p.loteId } : {}),
      cantidadContada: counted,
    };
  });
  const count = (await services.inventoryOps.createCount(keeper, {
    almacenId: warehouseId,
    nota: 'Conteo cíclico de cierre de semana',
    lineas: lines,
  })) as { id: string };
  const confirmed = (await services.inventoryOps.confirmCount(keeper, count.id)) as { operaciones?: number };
  return confirmed?.operaciones ?? 0;
}

const WALK_IN = [
  'Familia Morales', 'Andrea Castillo', 'Luis Fernando Pérez', 'Oficina Grupo Atlántida',
  'Sofía Herrera', 'Carlos Méndez', 'Familia Juárez', 'María José Ramírez',
] as const;
const RESERVATION_NOTES = [
  'Cumpleaños; traen su propio pastel',
  'Prefieren mesa en el mezzanine',
  'Necesitan silla para bebé',
  'Cena de trabajo; piden factura con NIT',
] as const;

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * Las reservas del día en el restaurante. Las que llegan se confirman (si
 * entraron pendientes), registran llegada y se sientan: `serve` le pide a la
 * historia la orden de esa mesa, que se cocina y cobra como cualquier otra.
 * Algunos días una reserva se cancela. Devuelve las ids cuyo horario la
 * historia debe mover con el día.
 */
export async function reservationsOfDay(
  services: OperationsServices,
  branchId: string,
  manager: Principal,
  clients: CustomerRef[],
  dayKey: string,
  dayIndex: number,
  weekday: number,
  rng: Rng,
  serve: (seat: Seat) => Promise<boolean>,
  note: Note,
): Promise<{ moved: string[]; served: number }> {
  const moved: string[] = [];
  let served = 0;
  const busy = weekday === 5 || weekday === 6 || weekday === 0;
  const arrivals = busy ? rng.int(1, 2) : rng.chance(0.35) ? 1 : 0;

  for (let i = 0; i < arrivals; i++) {
    const client = clients.length && rng.chance(0.6) ? rng.pick(clients) : null;
    const personas = rng.int(2, 6);
    const start = Date.now() + (20 + i * 10) * 60000;
    const pending = rng.chance(0.4);
    try {
      const created = (await services.reservations.create(manager, {
        sucursalId: branchId,
        nombreContacto: client?.nombre ?? rng.pick(WALK_IN),
        telefonoContacto: client?.telefono ?? `5${rng.int(1000000, 9999999)}`,
        personas,
        inicio: iso(start),
        fin: iso(start + 90 * 60000),
        clienteId: client?.id ?? null,
        notas: rng.chance(0.3) ? rng.pick(RESERVATION_NOTES) : null,
        estadoInicial: pending ? 'PENDIENTE' : 'CONFIRMADA',
        claveOperacion: `DEMO-RSV-${dayKey}-${i}`,
      })) as { id: string; mesas: { id: string }[] };
      moved.push(created.id);
      if (pending) await services.reservations.confirm(manager, created.id);
      await services.reservations.checkIn(manager, created.id);
      const mesaId = created.mesas[0]?.id;
      if (mesaId && (await serve({ mesaId, personas, clienteId: client?.id ?? null }))) served++;
    } catch (error) {
      note('reserva con llegada', error);
    }
  }

  // Una cancelación cada once días: el cliente avisa con tiempo.
  if (dayIndex % 11 === 5) {
    const client = clients.length ? rng.pick(clients) : null;
    const start = Date.now() + 90 * 60000;
    try {
      const created = (await services.reservations.create(manager, {
        sucursalId: branchId,
        nombreContacto: client?.nombre ?? rng.pick(WALK_IN),
        telefonoContacto: client?.telefono ?? `5${rng.int(1000000, 9999999)}`,
        personas: rng.int(2, 4),
        inicio: iso(start),
        fin: iso(start + 120 * 60000),
        clienteId: client?.id ?? null,
        estadoInicial: 'CONFIRMADA',
        claveOperacion: `DEMO-RSV-${dayKey}-CAN`,
      })) as { id: string };
      moved.push(created.id);
      await services.reservations.cancel(manager, created.id, {
        motivo: 'El cliente llamó para cancelar; reprogramará otra fecha',
      });
    } catch (error) {
      note('reserva cancelada', error);
    }
  }
  return { moved, served };
}

/**
 * Las reservas que el restaurante ya tiene para la semana que viene, tomadas
 * el último día de la historia. Estas sí quedan en el futuro real: es lo que
 * el cliente ve al abrir Reservas, con sus recordatorios pendientes.
 */
export async function upcomingReservations(
  services: OperationsServices,
  branchId: string,
  manager: Principal,
  clients: CustomerRef[],
  rng: Rng,
  note: Note,
): Promise<number> {
  const today = new Date();
  let made = 0;
  for (let i = 0; i < 6; i++) {
    const daysAhead = 1 + i;
    // Guatemala es UTC-6: almuerzo a las 13:00 y cena a las 19:30 locales.
    const dinner = rng.chance(0.6);
    const start = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + daysAhead,
      dinner ? 25 : 19,
      dinner ? 30 : 0,
    );
    const client = clients.length && rng.chance(0.7) ? rng.pick(clients) : null;
    try {
      await services.reservations.create(manager, {
        sucursalId: branchId,
        nombreContacto: client?.nombre ?? rng.pick(WALK_IN),
        telefonoContacto: client?.telefono ?? `5${rng.int(1000000, 9999999)}`,
        personas: rng.int(2, 6),
        inicio: iso(start),
        fin: iso(start + 120 * 60000),
        clienteId: client?.id ?? null,
        notas: rng.chance(0.4) ? rng.pick(RESERVATION_NOTES) : null,
        estadoInicial: i % 3 === 2 ? 'PENDIENTE' : 'CONFIRMADA',
        claveOperacion: `DEMO-RSV-PROX-${i}`,
      });
      made++;
    } catch (error) {
      note('reserva futura', error);
    }
  }
  return made;
}
