/**
 * Guards, phases and determinism for the demo seed.
 *
 * Resume state is not kept in a file. The database is asked instead: masters
 * are upserts and cost nothing to repeat, and the history phase resumes from
 * the last operational day each branch has closed. A progress file would be a
 * second source of truth that can disagree with reality — delete the rows and
 * the file still claims the week is done.
 */

export const DEMO_PREFIX = 'DEMO-';
export const PHASES = ['maestros', 'compras', 'historia'] as const;
export type Phase = (typeof PHASES)[number];

export interface DemoOptions {
  /** Phases to run, in order. */
  fases: Phase[];
  /** Branch codes to limit the run to; empty means every branch. */
  sucursales: string[];
  /** Weeks of simulated operation. */
  semanas: number;
  /** Average tickets per branch per day, before the weekday/hour pattern. */
  tickets: number;
  /** Wipe everything this seed created before running. */
  reset: boolean;
  /** Only report what would happen. */
  simular: boolean;
}

const DEFAULTS: DemoOptions = {
  fases: [...PHASES],
  sucursales: [],
  semanas: 8,
  tickets: 22,
  reset: false,
  simular: false,
};

export function parseOptions(argv: string[]): DemoOptions {
  const options: DemoOptions = { ...DEFAULTS, fases: [...DEFAULTS.fases], sucursales: [] };
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=');
    const value = rawValue ?? '';
    switch (rawKey) {
      case 'fase':
      case 'fases': {
        const asked = value.split(',').map((f) => f.trim()).filter(Boolean);
        const unknown = asked.filter((f) => !PHASES.includes(f as Phase));
        if (unknown.length) throw Error(`Fase desconocida: ${unknown.join(', ')}. Use ${PHASES.join(', ')}`);
        // Always in canonical order: purchases cannot precede masters.
        options.fases = PHASES.filter((p) => asked.includes(p));
        break;
      }
      case 'sucursal':
      case 'sucursales':
        options.sucursales = value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
        break;
      case 'semanas': {
        const weeks = Number(value);
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26)
          throw Error('--semanas debe ser un entero entre 1 y 26');
        options.semanas = weeks;
        break;
      }
      case 'tickets': {
        const tickets = Number(value);
        if (!Number.isInteger(tickets) || tickets < 1 || tickets > 200)
          throw Error('--tickets debe ser un entero entre 1 y 200');
        options.tickets = tickets;
        break;
      }
      case 'reset':
        options.reset = value !== 'false';
        break;
      case 'simular':
      case 'dry-run':
        options.simular = value !== 'false';
        break;
      default:
        throw Error(`Opción desconocida: --${rawKey}`);
    }
  }
  return options;
}

/**
 * Refuses to run anywhere it could do damage.
 *
 * The explicit environment variable is the real gate: it cannot be set by
 * accident, and it has to be set on the machine being seeded rather than
 * inherited from a developer's shell.
 */
export function assertAllowed(env: NodeJS.ProcessEnv): void {
  if (env.DEMO_SEED_ALLOW !== 'yes')
    throw Error(
      'La semilla de demostración está bloqueada. Exporte DEMO_SEED_ALLOW=yes en el servidor de demo.\n' +
      'No la ejecute contra la base de un cliente: crea y borra datos marcados como demo.',
    );
  if (env.NODE_ENV === 'production' && env.DEMO_SEED_FORCE_PROD !== 'yes')
    throw Error(
      'NODE_ENV=production. Si esta instancia es realmente de demostración, ' +
      'agregue DEMO_SEED_FORCE_PROD=yes; si no lo es, no continúe.',
    );
  if (!env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD.length < 12)
    throw Error('DEMO_SEED_PASSWORD requerido (mínimo 12 caracteres) para los usuarios de demostración');
}

/**
 * Deterministic generator (mulberry32), so two runs of the same options
 * produce the same demo. A sales script written against one run still matches
 * the next, and a bug that shows up on day 37 can be reproduced.
 */
export class Rng {
  private state: number;

  constructor(seed = 0x6a09e667) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw Error('pick() sobre una lista vacía');
    return items[Math.floor(this.next() * items.length)];
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Picks by weight; weights need not add up to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [item, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  /** Fisher-Yates over a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

/**
 * How busy each day and hour is.
 *
 * Flat volume is what makes a seeded database look seeded: every report comes
 * out as a straight line. These shapes are what give the charts something to
 * show — a weekend that matters to a repostería, a lunch peak in a kitchen.
 */
export const WEEKDAY_WEIGHT: Record<number, number> = {
  0: 0.75, // domingo
  1: 0.8,
  2: 0.85,
  3: 0.95,
  4: 1.05,
  5: 1.35, // viernes
  6: 1.3, // sábado
};

/** Share of a day's tickets per opening hour, by branch profile. */
export const HOUR_SHAPE: Record<string, Record<number, number>> = {
  // Morning bread and coffee, a second smaller afternoon visit.
  REPOSTERIA: { 7: 0.08, 8: 0.12, 9: 0.11, 10: 0.09, 11: 0.07, 12: 0.07, 13: 0.06, 14: 0.05, 15: 0.08, 16: 0.11, 17: 0.1, 18: 0.06 },
  // Commuter rush, then laptops all afternoon.
  CAFETERIA: { 7: 0.11, 8: 0.14, 9: 0.1, 10: 0.07, 11: 0.06, 12: 0.07, 13: 0.07, 14: 0.06, 15: 0.07, 16: 0.08, 17: 0.09, 18: 0.08 },
  // Lunch and dinner, nothing in between.
  RESTAURANTE: { 12: 0.16, 13: 0.19, 14: 0.12, 15: 0.04, 16: 0.03, 17: 0.04, 18: 0.1, 19: 0.16, 20: 0.12, 21: 0.04 },
  // Lunch peak and a long evening.
  RAPIDA: { 11: 0.07, 12: 0.15, 13: 0.15, 14: 0.08, 15: 0.05, 16: 0.05, 17: 0.08, 18: 0.12, 19: 0.13, 20: 0.08, 21: 0.04 },
};

/** Tickets for a given day, rounded, never below one. */
export function ticketsForDay(average: number, weekday: number, rng: Rng): number {
  const shaped = average * (WEEKDAY_WEIGHT[weekday] ?? 1) * rng.float(0.85, 1.15);
  return Math.max(1, Math.round(shaped));
}

/** Operational days from `weeks` ago up to yesterday, oldest first. */
export function operationalDays(weeks: number, today = new Date()): Date[] {
  const days: Date[] = [];
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let back = weeks * 7; back >= 1; back--) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - back);
    days.push(day);
  }
  return days;
}

export function formatDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Progress line that stays readable in a log file, not just a terminal. */
export function progress(phase: Phase, detail: string): void {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${phase.padEnd(9)} ${detail}\n`);
}

/**
 * Con qué frecuencia se produce una preparación, según su vida útil.
 *
 * Vive aquí porque la usan dos fases: la historia para decidir si hoy se hace
 * una tanda, y las compras para estimar cuánto insumo hace falta. Mientras
 * cada una tenía su propia idea, las compras se dimensionaban con el stock
 * mínimo —que es un umbral de reposición, no una demanda— y la producción se
 * quedaba sin ingredientes a los dos días.
 */
export const batchChance = (shelfLifeDays = 30): number =>
  shelfLifeDays <= 3 ? 0.85 : shelfLifeDays <= 7 ? 0.4 : 0.12;
