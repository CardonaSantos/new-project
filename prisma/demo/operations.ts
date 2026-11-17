/**
 * La operación de un día que no es vender: lo que el personal registra en
 * Inventario. Cada función recorre el mismo servicio que la pantalla
 * correspondiente, con el rol que la usa.
 *
 * Firmas leídas de los stores, no supuestas:
 *  - InventoryInternalConsumptionService.execute: solo SUMINISTRO o EMPAQUE;
 *    la clave es la del movimiento, única en todo el kardex.
 *  - InventoryOperationsService.createCount/confirmCount: un conteo por encima
 *    del teórico exige costo y inventory.costs.manage; las diferencias de un
 *    conteo real de cierre de semana son merma, no sobrante.
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
  /** InventoryInternalConsumptionService. */
  consumption: Service;
  /** InventoryOperationsService: conteos físicos. */
  inventoryOps: Service;
}

export interface CustomerRef {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
}

/** Una mesa ya asignada para un ticket (la usa la historia al sentar clientes). */
export interface Seat {
  mesaId: string;
  personas: number;
  clienteId: string | null;
}

const qtyText = (value: number): string => String(Math.max(0, Math.floor(value)));

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
