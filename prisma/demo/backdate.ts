/**
 * Moves the clock on rows this run created, without touching their amounts.
 *
 * Why this exists: the services stamp every date from the database clock
 * (DEFAULT CURRENT_TIMESTAMP, sixty of them in the baseline migration) and no
 * DTO in the order, receipt or payment flows accepts a date. Running eight
 * weeks of operation through the real services therefore stamps all of it
 * "today", and the reports — which filter on real timestamps like
 * Venta.cerradaEn, not on the operational day — would show one enormous day
 * and fifty-five empty ones.
 *
 * So the amounts, costs, stock and cost layers stay exactly what the system
 * computed, and only the clock is corrected afterwards. A ticket from six
 * weeks ago carries a date we assigned; everything about what it cost and what
 * it consumed is authentic.
 *
 * The column list is read from information_schema rather than kept here. A
 * hand-maintained list of eighty-three columns across forty-six tables would
 * drift the first time someone adds a model, and a missed column shows up as
 * one corner of the demo stamped today while everything around it is not.
 *
 * Shifts are uniform per window, so the order of events inside a simulated day
 * is preserved — which is what keeps FIFO cost layers in the right sequence.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';

type Db = PrismaClient;

interface DateColumn {
  table: string;
  column: string;
  /** Plain dates shift by whole days; they carry no time to preserve. */
  onlyDate: boolean;
}

/**
 * Columns the shift must never touch.
 *
 * Only session and token lifetimes: moving those into the past signs the demo
 * out of itself. Expiry dates on lots and invoices are deliberately *not*
 * here, and that matters more than it looks — the posting engine refuses to
 * consume from a lot whose fechaVencimiento is before *today*
 * ("Lote bloqueado o vencido"), and consumption happens before the clock is
 * corrected. So perishable lots are created valid as of now and then travel
 * back with everything else, which leaves a lot received eight weeks ago
 * expiring eight weeks ago plus its shelf life. Creating them already expired
 * would fail the run; leaving their expiry untouched would strand it in the
 * future.
 */
const SKIP: ReadonlySet<string> = new Set([
  'SesionUsuario.expiraEn',
  'SesionUsuario.creadaEn',
  'SesionUsuario.ultimoUsoEn',
  'SesionUsuario.revocadaEn',
]);

let cached: DateColumn[] | null = null;

/** Every timestamp and date column in the current schema, asked of the database. */
export async function dateColumns(db: Db): Promise<DateColumn[]> {
  if (cached) return cached;
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')
      ORDER BY table_name, column_name`,
  );
  cached = rows
    .map((r) => ({
      table: r.table_name,
      column: r.column_name,
      onlyDate: r.data_type === 'date',
    }))
    // Las tablas internas de Prisma (_prisma_migrations) no son del negocio: la
    // instalación se fecha hacia atrás, pero el historial de migraciones no.
    .filter((c) => !SKIP.has(`${c.table}.${c.column}`) && !c.table.startsWith('_'));
  return cached;
}

/** A moment to compare against; everything stamped at or after it is ours. */
export function marker(): Date {
  return new Date();
}

/** Guatemala no cambia de horario: UTC-6 todo el año. */
const GUATEMALA_OFFSET_MS = -6 * 3600_000;

/** La fecha local de Guatemala de un instante, YYYY-MM-DD. */
export function localDay(at: Date = new Date()): string {
  return new Date(at.getTime() + GUATEMALA_OFFSET_MS).toISOString().slice(0, 10);
}

/** El instante UTC de una hora local de Guatemala en un día dado. */
export function localInstant(day: string, minutes: number): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - GUATEMALA_OFFSET_MS + minutes * 60000);
}

/**
 * Shifts every row stamped at or after `from` back by `days` and `seconds`.
 *
 * The filter is the column itself: this seed owns its database, so anything
 * carrying a timestamp later than the marker was written by the run in
 * progress. Rows the initial seed wrote earlier are left alone.
 *
 * Con `dates`, también las columnas de solo fecha que llevan la fecha local de
 * hoy —el día operativo del turno, la emisión de la factura, la elaboración
 * del lote—, que son las que los servicios acaban de escribir. Antes esas se
 * comparaban contra el instante de la corrida y una fecha a medianoche nunca
 * caía en la ventana: todos los turnos de caja quedaban con el día operativo de
 * hoy. Los vencimientos nunca se mueven: el motor rechaza un lote vencido a la
 * fecha real, y un vencimiento movido al pasado lo vencería.
 */
export async function shiftSince(
  db: Db,
  from: Date,
  days: number,
  seconds = 0,
  options: { dates?: boolean } = {},
): Promise<number> {
  if (days === 0 && seconds === 0) return 0;
  const columns = await dateColumns(db);
  // Límite superior: el instante en que se corre el reajuste. Sin él la
  // condición era solo `columna >= from`, que también alcanza a las fechas
  // puestas a futuro — y un vencimiento de lote es una de ellas. Lo que este
  // reajuste debe mover es lo que la jornada acaba de sellar, no una fecha que
  // el negocio puso adelante a propósito.
  const until = new Date();
  const stamps = columns.filter((c) => !c.onlyDate);
  // Una sola consulta dice qué columnas tienen filas en la ventana, y solo esas
  // se actualizan. La historia reajusta ticket por ticket, y doscientos UPDATE
  // por ticket eran la mayor parte del tiempo de la corrida.
  const probe = stamps
    .map(
      (c, i) =>
        `SELECT ${i} AS i WHERE EXISTS (SELECT 1 FROM "${c.table}" WHERE "${c.column}" >= $1 AND "${c.column}" <= $2)`,
    )
    .join(' UNION ALL ');
  const hits = await db.$queryRawUnsafe<{ i: number }[]>(probe, from, until);
  let touched = 0;
  for (const { i } of hits) {
    const { table, column } = stamps[Number(i)];
    // Identifiers are quoted from information_schema, never from user input.
    touched += await db.$executeRawUnsafe(
      `UPDATE "${table}" SET "${column}" = "${column}" - make_interval(days => ${days}, secs => ${seconds})` +
        ` WHERE "${column}" >= $1 AND "${column}" <= $2`,
      from,
      until,
    );
  }
  if (options.dates && days !== 0) {
    const today = localDay(until);
    for (const { table, column, onlyDate } of columns) {
      if (!onlyDate || /venc|expira/i.test(column)) continue;
      // Hoy o mañana: lo que se fecha con new Date() guarda la fecha UTC, que
      // por la noche en Guatemala ya es el día siguiente.
      touched += await db.$executeRawUnsafe(
        `UPDATE "${table}" SET "${column}" = "${column}" - make_interval(days => ${days})` +
          ` WHERE "${column}" >= $1::date AND "${column}" <= ($1::date + 1)`,
        today,
      );
    }
  }
  return touched;
}

/**
 * Confirms the shift left nothing behind.
 *
 * The risk this guards against is a column the shift skipped, which shows up
 * as one corner of the demo stamped today while the rest sits weeks back. It
 * reports per table so the gap is obvious rather than merely counted.
 */
export async function auditDates(
  db: Db,
  from: Date,
  allow: ReadonlySet<string> = new Set(),
  until: Date = new Date(),
): Promise<{ table: string; column: string; rows: number }[]> {
  const columns = await dateColumns(db);
  const leftovers: { table: string; column: string; rows: number }[] = [];
  for (const { table, column } of columns) {
    if (allow.has(`${table}.${column}`)) continue;
    // La misma ventana que usa el reajuste: una fecha a futuro no quedó
    // atrás por error, se dejó adelante a propósito.
    const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}"` +
        ` WHERE "${column}" >= $1 AND "${column}" <= $2`,
      from,
      until,
    );
    if (count > 0n) leftovers.push({ table, column, rows: Number(count) });
  }
  return leftovers;
}
