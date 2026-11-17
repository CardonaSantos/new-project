/**
 * Lo que el demo promete, contado al terminar.
 *
 * La semilla ya terminó «bien» una vez sin vender un solo ticket: un catch
 * silencioso lo tapaba. Esta tabla cuenta, acotado a las sucursales demo de la
 * corrida, cada cosa que el cliente debería encontrar en su pantalla, y la
 * corrida falla si alguna que correspondía quedó vacía. Lo que depende de la
 * duración —los pagos a proveedor desde el banco empiezan con la reposición
 * de la segunda semana, la reversa llega el quinto día— solo se exige cuando
 * la corrida dura lo suficiente.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { MasterIds } from './masters.js';
import type { DemoOptions } from './runtime.js';

type Db = PrismaClient;

export interface CoverageRow {
  label: string;
  count: number;
  /** Si una corrida con este alcance tenía que producirlo. */
  required: boolean;
}

export async function coverage(db: Db, ids: MasterIds, options: DemoOptions): Promise<CoverageRow[]> {
  const scope = [...ids.branches].filter(
    ([code]) => !options.sucursales.length || options.sucursales.includes(code),
  );
  const b = { in: scope.map(([, id]) => id) };
  const locations = scope.map(([code]) => ids.locations.get(code)).filter((id): id is string => !!id);
  const days = options.semanas * 7;

  const rows: [string, Promise<number>, boolean][] = [
    ['Órdenes', db.orden.count({ where: { sucursalId: b } }), true],
    ['Órdenes desde el QR de la mesa', db.orden.count({ where: { sucursalId: b, origen: 'QR' } }), true],
    ['Órdenes con cliente registrado', db.orden.count({ where: { sucursalId: b, clienteId: { not: null } } }), true],
    ['Pagos', db.pago.count({ where: { cuenta: { orden: { sucursalId: b } } } }), true],
    ['Comandas de cocina', db.comanda.count({ where: { orden: { sucursalId: b } } }), true],
    ['Entregas a domicilio', db.entrega.count({ where: { orden: { sucursalId: b } } }), true],
    ['Sesiones de autoservicio', db.sesionAutoservicio.count({ where: { sucursalId: b } }), true],
    ['Producciones', db.produccionLote.count({ where: { ubicacionDestinoId: { in: locations } } }), true],
    ['Movimientos de inventario', db.movimientoInventario.count({ where: { ubicacion: { almacen: { sucursalId: b } } } }), true],
    ['Órdenes de compra', db.ordenCompra.count({ where: { sucursalId: b } }), true],
    ['Facturas de proveedor', db.facturaProveedor.count({ where: { sucursalId: b } }), true],
    ['Pagos a proveedor', db.pagoProveedor.count({ where: { sucursalId: b } }), true],
    ['Pagos a proveedor desde el banco', db.pagoProveedor.count({ where: { sucursalId: b, cuentaFinancieraId: { not: null } } }), days > 7],
    ['Conteos físicos', db.conteoInventario.count({ where: { almacen: { sucursalId: b } } }), true],
    ['Ajustes por conteo', db.ajusteInventario.count({ where: { almacen: { sucursalId: b } } }), true],
    ['Consumos internos', db.consumoInterno.count({ where: { ubicacionId: { in: locations } } }), true],
    ['Mermas de cierre', db.movimientoInventario.count({ where: { tipo: 'MERMA', ubicacion: { almacen: { sucursalId: b } } } }), false],
    ['Turnos de caja', db.turnoCaja.count({ where: { caja: { sucursalId: b } } }), true],
    ['Cierres operativos', db.cierreOperativo.count({ where: { sucursalId: b } }), true],
    ['Gastos', db.gastoOperativo.count({ where: { sucursalId: b } }), true],
    ['Gastos pagados desde el banco', db.gastoOperativo.count({ where: { sucursalId: b, cuentaFinancieraId: { not: null } } }), days > 5],
    ['Movimientos de tesorería', db.movimientoFinanciero.count({ where: { cuenta: { sucursalId: b } } }), true],
    ['Líneas de extracto bancario', db.lineaExtractoBancario.count({ where: { cuentaFinanciera: { sucursalId: b } } }), true],
    ['Líneas conciliadas', db.lineaExtractoBancario.count({ where: { cuentaFinanciera: { sucursalId: b }, movimientoFinancieroId: { not: null } } }), true],
    ['Reversas financieras', db.reversaFinanciera.count({ where: { sucursalId: b } }), days > 5],
    ['Dispositivos', db.dispositivo.count({ where: { sucursalId: b } }), true],
    // Sin foto confirmada, el POS y el QR no muestran el producto.
    ['Productos con foto', db.productoMedia.count({ where: { media: { confirmadaEn: { not: null }, tipo: 'IMAGEN' } } }), true],
    ['QR de mesa vigentes', db.accesoMesaQR.count({ where: { activo: true, mesa: { sala: { sucursalId: b } } } }), true],
  ];
  const counts = await Promise.all(rows.map(([, count]) => count));
  return rows.map(([label, , required], i) => ({ label, count: counts[i], required }));
}

export function coverageReport(rows: CoverageRow[]): { text: string; missing: string[] } {
  const width = Math.max(...rows.map((r) => r.label.length));
  const text = rows
    .map((r) => `  ${r.label.padEnd(width)}  ${String(r.count).padStart(7)}${r.required && !r.count ? '   ← VACÍO' : ''}`)
    .join('\n');
  return { text, missing: rows.filter((r) => r.required && !r.count).map((r) => r.label) };
}
