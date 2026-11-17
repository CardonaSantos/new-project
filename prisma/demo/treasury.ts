/**
 * Tesorería del mes: lo que entra y sale del banco de cada sucursal y cómo
 * finanzas lo cuadra contra el extracto.
 *
 * Firmas y reglas leídas de finance.store y finance-bank.store:
 *  - Cada operación financiera consume una intención propia (issueIntent),
 *    atada al actor, la sucursal y la acción: un gasto, una importación de
 *    extracto, una conciliación y una reversa piden la suya.
 *  - Un gasto con origen en la cuenta exige cuentaFinancieraId sin turno y
 *    una referencia de documento; asienta su MovimientoFinanciero negativo.
 *  - Importar: hasta 100 líneas por operación, clave externa única por
 *    cuenta, monto firmado distinto de cero, fecha YYYY-MM-DD.
 *  - Conciliar: mismo monto firmado, misma cuenta, la referencia del banco
 *    igual a una de la fuente (en un cobro: referencia, autorización o
 *    terminal) y la fecha bancaria entre el día local de origen y 14 días
 *    después. Sin eso exige una excepción autorizada, que aquí no se fuerza.
 *  - Revertir: solo un gasto bancario no conciliado, con motivo, y nunca en
 *    un período cerrado. Por eso el duplicado se anula antes de cualquier
 *    extracto, y el extracto no lo trae: el banco cobró una sola vez.
 *
 * Los servicios los paga el gerente (tiene finance.expenses.create); el
 * extracto, la conciliación y la reversa los hace finanzas, que en el demo es
 * el administrador central, el mismo que firma el cierre operativo.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { Principal } from '../../src/modules/auth/application/auth.service.js';
import type { MasterIds } from './masters.js';
import type { Rng } from './runtime.js';

type Db = PrismaClient;
type Service = Record<string, (...args: any[]) => Promise<any>>;
type Note = (step: string, error: unknown) => void;

export interface TreasuryServices {
  /** FinanceService: intenciones y gastos. */
  finance: Service;
  /** FinanceBankService: extracto, conciliación y reversas. */
  bank: Service;
}

/** Los servicios del mes, cada uno en su día del período. */
const BILLS = [
  { dia: 2, clave: 'EEGSA', descripcion: 'Energía eléctrica EEGSA', monto: [900, 1600] },
  { dia: 3, clave: 'TIGO', descripcion: 'Internet y telefonía Tigo Business', monto: [420, 520] },
  { dia: 5, clave: 'EMPAGUA', descripcion: 'Agua potable EMPAGUA', monto: [150, 260] },
] as const;
/** Donde el gerente registra dos veces la misma factura, y el día que finanzas lo anula. */
const DUPLICATE = { sucursal: 'CAFETERIA', clave: 'TIGO', anulaEnDia: 4 } as const;

const ZONE = 'America/Guatemala';

async function intent(services: TreasuryServices, actor: Principal, sucursalId: string, accion: string): Promise<string> {
  const issued = (await services.finance.issueIntent(actor, { sucursalId, accion })) as { operationId: string };
  return issued.operationId;
}

/** El día local de un instante, como lo calcula localBankDay en el módulo. */
function localDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Los servicios del mes, pagados desde el banco de la sucursal. En la
 * cafetería el gerente registra dos veces el internet y, al día siguiente,
 * finanzas anula el duplicado con una reversa: la corrección que el módulo
 * permite y que el demo debe mostrar.
 */
export async function monthlyBills(
  services: TreasuryServices,
  ids: MasterIds,
  branchCode: string,
  branchId: string,
  manager: Principal,
  admin: Principal,
  dayIndex: number,
  dayKey: string,
  rng: Rng,
  duplicates: Map<string, string>,
  note: Note,
): Promise<void> {
  const bank = ids.accounts.get(`BANCO:${branchCode}`);
  if (!bank) return;

  for (const bill of BILLS) {
    if (bill.dia !== dayIndex) continue;
    const monto = (Math.round(rng.float(bill.monto[0], bill.monto[1]) * 100) / 100).toFixed(2);
    const expense = {
      sucursalId: branchId,
      origen: 'CUENTA_FINANCIERA',
      cuentaFinancieraId: bank,
      monto,
      descripcion: bill.descripcion,
      categoria: 'SERVICIOS',
      documentoReferencia: `${bill.clave}-${branchCode.slice(0, 3)}-${dayKey.replace(/-/g, '')}`,
    };
    try {
      await services.finance.createExpense(manager, {
        ...expense,
        operationId: await intent(services, manager, branchId, 'FIN_EXPENSE_CREATE'),
      });
      if (branchCode === DUPLICATE.sucursal && bill.clave === DUPLICATE.clave) {
        const twice = (await services.finance.createExpense(manager, {
          ...expense,
          operationId: await intent(services, manager, branchId, 'FIN_EXPENSE_CREATE'),
        })) as { movimientoId: string };
        duplicates.set(branchCode, twice.movimientoId);
      }
    } catch (error) {
      note('gasto bancario', error);
    }
  }

  const duplicated = duplicates.get(branchCode);
  if (duplicated && dayIndex === DUPLICATE.anulaEnDia) {
    try {
      await services.bank.reverse(admin, {
        operationId: await intent(services, admin, branchId, 'FIN_LEDGER_REVERSE'),
        sucursalId: branchId,
        movimientoId: duplicated,
        motivo: 'Factura de internet registrada dos veces; se anula el duplicado',
      });
      duplicates.delete(branchCode);
    } catch (error) {
      note('reversa del gasto duplicado', error);
    }
  }
}

interface StatementLine {
  claveExterna: string;
  fecha: string;
  monto: string;
  referencia: string;
  descripcion: string;
  movimientoId: string | null;
}

/**
 * El extracto del banco de una sucursal hasta ayer, importado y conciliado.
 *
 * Cada asiento bancario que todavía no salió en un extracto se vuelve una
 * línea con la referencia y la fecha que el banco pondría: la liquidación de
 * tarjeta llega al día siguiente con el código de autorización, una
 * transferencia y un débito llegan el mismo día con su referencia. Se suma la
 * comisión mensual, que no tiene asiento y queda pendiente: es la línea que
 * finanzas tendría que investigar. En el cierre de mes, lo de los dos últimos
 * días también queda pendiente, como queda en cualquier conciliación real.
 */
export async function bankStatement(
  db: Db,
  services: TreasuryServices,
  ids: MasterIds,
  branchCode: string,
  branchId: string,
  admin: Principal,
  mark: Date,
  dayKey: string,
  tag: string,
  closing: boolean,
  stated: Set<string>,
  note: Note,
): Promise<{ lines: number; matched: number }> {
  const bank = ids.accounts.get(`BANCO:${branchCode}`);
  if (!bank) return { lines: 0, matched: 0 };

  const movements = await db.movimientoFinanciero.findMany({
    where: { cuentaId: bank, creadoEn: { lt: mark } },
    select: { id: true, monto: true, referenciaTipo: true, referenciaId: true },
    orderBy: { creadoEn: 'asc' },
  });
  // Lo anulado no pasó por el banco: ni el duplicado ni su reversa salen.
  const reversals = await db.reversaFinanciera.findMany({
    where: { sucursalId: branchId },
    select: { movimientoOriginalId: true, movimientoReversaId: true },
  });
  const voided = new Set(reversals.flatMap((r) => [r.movimientoOriginalId, r.movimientoReversaId]));
  // Lo que ya está conciliado de una corrida anterior tampoco se repite.
  const linked = new Set(
    (
      await db.lineaExtractoBancario.findMany({
        where: { cuentaFinancieraId: bank, movimientoFinancieroId: { not: null } },
        select: { movimientoFinancieroId: true },
      })
    ).map((l) => l.movimientoFinancieroId),
  );

  const code = branchCode.slice(0, 3);
  const lines: StatementLine[] = [];
  for (const movement of movements) {
    if (stated.has(movement.id) || voided.has(movement.id) || linked.has(movement.id)) continue;
    let reference: string | null = null;
    let origin: Date | null = null;
    let lag = 0;
    let description = '';
    if (movement.referenciaTipo === 'PAGO') {
      const payment = await db.pago.findUnique({
        where: { id: movement.referenciaId },
        select: { metodo: true, referencia: true, codigoAutorizacion: true, cobradoEn: true },
      });
      if (!payment) continue;
      const card = payment.metodo === 'TARJETA';
      reference = card ? payment.codigoAutorizacion : payment.referencia;
      origin = payment.cobradoEn;
      lag = card ? 1 : 0;
      description = card ? 'Liquidación de ventas con tarjeta' : 'Transferencia recibida';
    } else if (movement.referenciaTipo === 'PAGO_PROVEEDOR') {
      const payment = await db.pagoProveedor.findUnique({
        where: { id: movement.referenciaId },
        select: { referencia: true, confirmadoEn: true, pagadoEn: true },
      });
      if (!payment) continue;
      reference = payment.referencia;
      origin = payment.confirmadoEn ?? payment.pagadoEn;
      description = 'Transferencia a proveedor';
    } else if (movement.referenciaTipo === 'GASTO_OPERATIVO') {
      const expense = await db.gastoOperativo.findUnique({
        where: { id: movement.referenciaId },
        select: { documentoReferencia: true, registradoEn: true, descripcion: true },
      });
      if (!expense) continue;
      reference = expense.documentoReferencia;
      origin = expense.registradoEn;
      description = `Débito: ${expense.descripcion}`;
    }
    if (!reference || !origin) continue;
    const originDay = localDay(origin);
    // Nunca después del día del extracto, y la ventana del módulo admite 0.
    const settled = addDays(originDay, lag);
    const fecha = settled > dayKey ? originDay : settled;
    lines.push({
      claveExterna: `BAC-${code}-${tag}-${String(lines.length + 1).padStart(4, '0')}`,
      fecha,
      monto: movement.monto.toFixed(2),
      referencia: reference,
      descripcion: description,
      movimientoId: movement.id,
    });
  }
  lines.push({
    claveExterna: `BAC-${code}-${tag}-COM`,
    fecha: addDays(dayKey, -1),
    monto: '-25.00',
    referencia: `COM-${tag}`,
    descripcion: 'Comisión por manejo de cuenta',
    movimientoId: null,
  });

  // Importar en lotes de cien, cada lote con su intención.
  const imported: { lineaId: string; line: StatementLine }[] = [];
  for (let start = 0; start < lines.length; start += 100) {
    const chunk = lines.slice(start, start + 100);
    const result = (await services.bank.importLines(admin, {
      operationId: await intent(services, admin, branchId, 'FIN_STATEMENT_IMPORT'),
      sucursalId: branchId,
      cuentaFinancieraId: bank,
      lineas: chunk.map(({ movimientoId, ...line }) => line),
    })) as { lineaIds: string[] };
    result.lineaIds.forEach((lineaId, i) => imported.push({ lineaId, line: chunk[i] }));
  }
  for (const line of lines) if (line.movimientoId) stated.add(line.movimientoId);

  const pendingFrom = closing ? addDays(dayKey, -1) : null;
  let matched = 0;
  for (const { lineaId, line } of imported) {
    if (!line.movimientoId) continue;
    if (pendingFrom && line.fecha >= pendingFrom) continue;
    try {
      await services.bank.match(admin, {
        operationId: await intent(services, admin, branchId, 'FIN_STATEMENT_MATCH'),
        sucursalId: branchId,
        lineaId,
        movimientoId: line.movimientoId,
      });
      matched++;
    } catch (error) {
      // Una línea que no concilia queda pendiente y se reporta; las demás siguen.
      note('conciliación bancaria', error);
    }
  }
  return { lines: imported.length, matched };
}
