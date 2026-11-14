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
    .filter((c) => !SKIP.has(`${c.table}.${c.column}`));
  return cached;
}

/** A moment to compare against; everything stamped at or after it is ours. */
export function marker(): Date {
  return new Date();
}

/**
 * Shifts every row stamped at or after `from` back by `days` and `seconds`.
 *
 * The filter is the column itself: this seed owns its database, so anything
 * carrying a timestamp later than the marker was written by the run in
 * progress. Rows the initial seed wrote earlier are left alone.
 */
export async function shiftSince(
  db: Db,
  from: Date,
  days: number,
  seconds = 0,
): Promise<number> {
  if (days === 0 && seconds === 0) return 0;
  const columns = await dateColumns(db);
  let touched = 0;
  for (const { table, column, onlyDate } of columns) {
    const interval = onlyDate
      ? `make_interval(days => ${days})`
      : `make_interval(days => ${days}, secs => ${seconds})`;
    // Identifiers are quoted from information_schema, never from user input.
    const affected = await db.$executeRawUnsafe(
      `UPDATE "${table}" SET "${column}" = "${column}" - ${interval} WHERE "${column}" >= $1`,
      from,
    );
    touched += affected;
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
): Promise<{ table: string; column: string; rows: number }[]> {
  const columns = await dateColumns(db);
  const leftovers: { table: string; column: string; rows: number }[] = [];
  for (const { table, column } of columns) {
    if (allow.has(`${table}.${column}`)) continue;
    const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${table}" WHERE "${column}" >= $1`,
      from,
    );
    if (count > 0n) leftovers.push({ table, column, rows: Number(count) });
  }
  return leftovers;
}
