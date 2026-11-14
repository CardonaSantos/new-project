/**
 * Removes what the demonstration seed created, and nothing else.
 *
 * Almost every foreign key in this schema is onDelete: Restrict, so order is
 * not a detail — a delete in the wrong sequence fails halfway and leaves the
 * database in a state neither seeded nor clean. The order below runs from the
 * leaves inward: events, then money, then orders, then stock, then the
 * masters that all of it hangs from.
 *
 * Scope comes from two anchors. Transactional rows are reached through the
 * demo branches, and masters through the DEMO- prefix on their codes.
 * Categories and modifier groups carry no code, so they are matched by the
 * names the demo data declares — which is safe on a demo instance and is the
 * reason this seed refuses to run anywhere else.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { categories, modifierGroups } from './products.js';
import { packagingRules } from './supply.js';
import { DEMO_PREFIX } from './runtime.js';

type Db = PrismaClient;

/**
 * Deletes, in dependency order. Each entry is a table and the condition that
 * selects the demo's own rows, written against the branch or prefix anchors.
 */
function statements(branchIds: string[], articleIds: string[]): { label: string; sql: string }[] {
  const branches = branchIds.map((id) => `'${id}'`).join(',');
  const articles = articleIds.map((id) => `'${id}'`).join(',');
  const inBranch = (column = 'sucursalId') => `"${column}" IN (${branches})`;

  return [
    // --- events and projections ------------------------------------------
    { label: 'eventos de orden', sql: `DELETE FROM "EventoOrden" WHERE "ordenId" IN (SELECT id FROM "Orden" WHERE ${inBranch()})` },
    { label: 'eventos de comanda', sql: `DELETE FROM "EventoComanda" WHERE "comandaId" IN (SELECT c.id FROM "Comanda" c JOIN "Orden" o ON o.id=c."ordenId" WHERE o.${inBranch()})` },
    { label: 'eventos de reserva', sql: `DELETE FROM "EventoReserva" WHERE "reservaId" IN (SELECT id FROM "Reserva" WHERE ${inBranch()})` },
    { label: 'eventos de entrega', sql: `DELETE FROM "EntregaEvento" WHERE "entregaId" IN (SELECT e.id FROM "Entrega" e JOIN "Orden" o ON o.id=e."ordenId" WHERE o.${inBranch()})` },

    // --- money -------------------------------------------------------------
    { label: 'aplicaciones de pago a proveedor', sql: `DELETE FROM "AplicacionPagoProveedor" WHERE "pagoId" IN (SELECT id FROM "PagoProveedor" WHERE ${inBranch()})` },
    { label: 'pagos a proveedor', sql: `DELETE FROM "PagoProveedor" WHERE ${inBranch()}` },
    { label: 'líneas de factura de proveedor', sql: `DELETE FROM "FacturaProveedorLinea" WHERE "facturaId" IN (SELECT id FROM "FacturaProveedor" WHERE ${inBranch()})` },
    { label: 'facturas de proveedor', sql: `DELETE FROM "FacturaProveedor" WHERE ${inBranch()}` },
    { label: 'pagos', sql: `DELETE FROM "Pago" WHERE "cuentaId" IN (SELECT c.id FROM "Cuenta" c JOIN "Orden" o ON o.id=c."ordenId" WHERE o.${inBranch()})` },
    { label: 'intentos de pago', sql: `DELETE FROM "IntentoPago" WHERE "cuentaId" IN (SELECT c.id FROM "Cuenta" c JOIN "Orden" o ON o.id=c."ordenId" WHERE o.${inBranch()})` },
    { label: 'ventas', sql: `DELETE FROM "Venta" WHERE ${inBranch()}` },
    { label: 'líneas de cuenta', sql: `DELETE FROM "CuentaLinea" WHERE "cuentaId" IN (SELECT c.id FROM "Cuenta" c JOIN "Orden" o ON o.id=c."ordenId" WHERE o.${inBranch()})` },
    { label: 'cuentas', sql: `DELETE FROM "Cuenta" WHERE "ordenId" IN (SELECT id FROM "Orden" WHERE ${inBranch()})` },
    { label: 'gastos operativos', sql: `DELETE FROM "GastoOperativo" WHERE ${inBranch()}` },
    // Un movimiento financiero no conoce la sucursal: cuelga de la cuenta.
    { label: 'movimientos financieros', sql: `DELETE FROM "MovimientoFinanciero" WHERE "cuentaId" IN (SELECT id FROM "CuentaFinanciera" WHERE ${inBranch()})` },
    { label: 'movimientos de caja', sql: `DELETE FROM "MovimientoCaja" WHERE "turnoId" IN (SELECT t.id FROM "TurnoCaja" t JOIN "Caja" c ON c.id=t."cajaId" WHERE c.${inBranch()})` },
    { label: 'turnos de caja', sql: `DELETE FROM "TurnoCaja" WHERE "cajaId" IN (SELECT id FROM "Caja" WHERE ${inBranch()})` },
    { label: 'cierres operativos', sql: `DELETE FROM "CierreOperativo" WHERE ${inBranch()}` },

    // --- service -----------------------------------------------------------
    { label: 'entregas', sql: `DELETE FROM "Entrega" WHERE "ordenId" IN (SELECT id FROM "Orden" WHERE ${inBranch()})` },
    { label: 'líneas de comanda', sql: `DELETE FROM "ComandaLinea" WHERE "comandaId" IN (SELECT c.id FROM "Comanda" c JOIN "Orden" o ON o.id=c."ordenId" WHERE o.${inBranch()})` },
    { label: 'comandas', sql: `DELETE FROM "Comanda" WHERE "ordenId" IN (SELECT id FROM "Orden" WHERE ${inBranch()})` },
    // Before the orders: a self-service session references its order with
    // Restrict, so deleting orders first fails on the foreign key.
    { label: 'sesiones de autoservicio', sql: `DELETE FROM "SesionAutoservicio" WHERE ${inBranch()}` },
    { label: 'modificadores de línea', sql: `DELETE FROM "OrdenLineaModificador" WHERE "ordenLineaId" IN (SELECT l.id FROM "OrdenLinea" l JOIN "Orden" o ON o.id=l."ordenId" WHERE o.${inBranch()})` },
    { label: 'líneas de orden', sql: `DELETE FROM "OrdenLinea" WHERE "ordenId" IN (SELECT id FROM "Orden" WHERE ${inBranch()})` },
    { label: 'órdenes', sql: `DELETE FROM "Orden" WHERE ${inBranch()}` },
    { label: 'ocupaciones de mesa', sql: `DELETE FROM "OcupacionMesa" WHERE "mesaId" IN (SELECT m.id FROM "Mesa" m JOIN "Sala" s ON s.id=m."salaId" WHERE s.${inBranch()})` },
    { label: 'reservas', sql: `DELETE FROM "Reserva" WHERE ${inBranch()}` },

    // --- stock -------------------------------------------------------------
    // Un lote de producción tampoco: llega a la sucursal por la ubicación de
    // destino, pero la clave de operación que el demo le pone es un ancla más
    // directa y más estrecha, del mismo prefijo que todo lo demás.
    { label: 'consumos de producción', sql: `DELETE FROM "ProduccionConsumo" WHERE "produccionId" IN (SELECT id FROM "ProduccionLote" WHERE "claveOperacion" LIKE '${DEMO_PREFIX}%')` },
    { label: 'lotes de producción', sql: `DELETE FROM "ProduccionLote" WHERE "claveOperacion" LIKE '${DEMO_PREFIX}%'` },
    { label: 'movimientos de inventario', sql: `DELETE FROM "MovimientoInventario" WHERE "articuloId" IN (${articles})` },
    { label: 'capas de costo', sql: `DELETE FROM "CapaCostoInventario" WHERE "articuloId" IN (${articles})` },
    { label: 'existencias', sql: `DELETE FROM "Existencia" WHERE "articuloId" IN (${articles})` },
    { label: 'líneas de recepción', sql: `DELETE FROM "RecepcionCompraLinea" WHERE "articuloId" IN (${articles})` },
    { label: 'recepciones', sql: `DELETE FROM "RecepcionCompra" WHERE "almacenId" IN (SELECT id FROM "Almacen" WHERE ${inBranch()})` },
    { label: 'líneas de orden de compra', sql: `DELETE FROM "OrdenCompraLinea" WHERE "articuloId" IN (${articles})` },
    { label: 'órdenes de compra', sql: `DELETE FROM "OrdenCompra" WHERE ${inBranch()}` },
    { label: 'lotes de inventario', sql: `DELETE FROM "LoteInventario" WHERE "articuloId" IN (${articles})` },

    // --- catalog and configuration ----------------------------------------
    { label: 'precios de variante', sql: `DELETE FROM "PrecioVariante" WHERE "varianteId" IN (SELECT id FROM "VarianteProducto" WHERE sku LIKE '${DEMO_PREFIX}%')` },
    { label: 'precios de modificador', sql: `DELETE FROM "PrecioModificador" WHERE ${inBranch()}` },
    { label: 'ítems de menú', sql: `DELETE FROM "MenuItem" WHERE "seccionId" IN (SELECT s.id FROM "MenuSeccion" s JOIN "Menu" m ON m.id=s."menuId" WHERE m.codigo LIKE '${DEMO_PREFIX}%')` },
    { label: 'secciones de menú', sql: `DELETE FROM "MenuSeccion" WHERE "menuId" IN (SELECT id FROM "Menu" WHERE codigo LIKE '${DEMO_PREFIX}%')` },
    { label: 'menús por sucursal', sql: `DELETE FROM "MenuSucursal" WHERE "menuId" IN (SELECT id FROM "Menu" WHERE codigo LIKE '${DEMO_PREFIX}%')` },
    { label: 'menús', sql: `DELETE FROM "Menu" WHERE codigo LIKE '${DEMO_PREFIX}%'` },
    { label: 'líneas de regla de empaque', sql: `DELETE FROM "ReglaEmpaqueLinea" WHERE "reglaId" IN (SELECT id FROM "ReglaEmpaque" WHERE nombre IN (${packagingRules.map((r) => `'${r.nombre.replace(/'/g, "''")}'`).join(',')}))` },
    { label: 'reglas de empaque', sql: `DELETE FROM "ReglaEmpaque" WHERE nombre IN (${packagingRules.map((r) => `'${r.nombre.replace(/'/g, "''")}'`).join(',')})` },
    { label: 'componentes de receta', sql: `DELETE FROM "RecetaComponente" WHERE "articuloId" IN (${articles})` },
    { label: 'versiones de receta', sql: `DELETE FROM "RecetaVersion" WHERE "recetaId" IN (SELECT id FROM "Receta" WHERE "varianteId" IN (SELECT id FROM "VarianteProducto" WHERE sku LIKE '${DEMO_PREFIX}%') OR "articuloResultadoId" IN (${articles}))` },
    { label: 'recetas', sql: `DELETE FROM "Receta" WHERE "varianteId" IN (SELECT id FROM "VarianteProducto" WHERE sku LIKE '${DEMO_PREFIX}%') OR "articuloResultadoId" IN (${articles})` },
    { label: 'grupos por variante', sql: `DELETE FROM "VarianteGrupoModificador" WHERE "varianteId" IN (SELECT id FROM "VarianteProducto" WHERE sku LIKE '${DEMO_PREFIX}%')` },
    { label: 'variantes', sql: `DELETE FROM "VarianteProducto" WHERE sku LIKE '${DEMO_PREFIX}%'` },
    { label: 'productos', sql: `DELETE FROM "Producto" WHERE codigo LIKE '${DEMO_PREFIX}%'` },
    { label: 'componentes de modificador', sql: `DELETE FROM "ModificadorComponente" WHERE "articuloId" IN (${articles})` },
    { label: 'modificadores', sql: `DELETE FROM "Modificador" WHERE "grupoId" IN (SELECT id FROM "GrupoModificador" WHERE nombre IN (${modifierGroups.map((g) => `'${g.nombre.replace(/'/g, "''")}'`).join(',')}))` },
    { label: 'grupos de modificadores', sql: `DELETE FROM "GrupoModificador" WHERE nombre IN (${modifierGroups.map((g) => `'${g.nombre.replace(/'/g, "''")}'`).join(',')})` },
    { label: 'presentaciones de compra', sql: `DELETE FROM "PresentacionCompra" WHERE "articuloId" IN (${articles})` },
    { label: 'artículos de inventario', sql: `DELETE FROM "ArticuloInventario" WHERE codigo LIKE '${DEMO_PREFIX}%'` },
    { label: 'categorías', sql: `DELETE FROM "Categoria" WHERE nombre IN (${categories.map((c) => `'${c.nombre.replace(/'/g, "''")}'`).join(',')})` },

    // --- branch scaffolding ------------------------------------------------
    { label: 'rutas de preparación', sql: `DELETE FROM "RutaPreparacion" WHERE "estacionId" IN (SELECT id FROM "EstacionPreparacion" WHERE ${inBranch()})` },
    { label: 'estaciones', sql: `DELETE FROM "EstacionPreparacion" WHERE ${inBranch()}` },
    { label: 'accesos QR de mesa', sql: `DELETE FROM "AccesoMesaQR" WHERE "mesaId" IN (SELECT m.id FROM "Mesa" m JOIN "Sala" s ON s.id=m."salaId" WHERE s.${inBranch()})` },
    { label: 'mesas', sql: `DELETE FROM "Mesa" WHERE "salaId" IN (SELECT id FROM "Sala" WHERE ${inBranch()})` },
    { label: 'salas', sql: `DELETE FROM "Sala" WHERE ${inBranch()}` },
    { label: 'cajas', sql: `DELETE FROM "Caja" WHERE ${inBranch()}` },
    { label: 'ubicaciones', sql: `DELETE FROM "UbicacionAlmacen" WHERE "almacenId" IN (SELECT id FROM "Almacen" WHERE ${inBranch()})` },
    { label: 'almacenes', sql: `DELETE FROM "Almacen" WHERE ${inBranch()}` },
    { label: 'configuración de sucursal', sql: `DELETE FROM "ConfiguracionSucursal" WHERE ${inBranch()}` },
    { label: 'roles de usuario demo', sql: `DELETE FROM "UsuarioRol" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email LIKE '%@demo.local')` },
    { label: 'perfiles de usuario demo', sql: `DELETE FROM "PerfilUsuario" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email LIKE '%@demo.local')` },
    { label: 'sesiones de usuario demo', sql: `DELETE FROM "SesionUsuario" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email LIKE '%@demo.local')` },
    { label: 'usuarios demo', sql: `DELETE FROM "Usuario" WHERE email LIKE '%@demo.local'` },
    { label: 'proveedores demo', sql: `DELETE FROM "Proveedor" WHERE nit IN ('3456789-1','4567890-2','5678901-3','6789012-4','7890123-5','8901234-6','9012345-7')` },
    { label: 'sucursales', sql: `DELETE FROM "Sucursal" WHERE codigo LIKE '${DEMO_PREFIX}%'` },

    // --- idempotency -------------------------------------------------------
    // Without this the reset is worse than useless. `once()` hashes the
    // payload, and most payloads carry the id of a document from the same run,
    // so after a reset the keys survive with hashes of rows that no longer
    // exist: a re-seed either refuses ("clave reutilizada con otros
    // parámetros") or, where the payload happens to match, returns the stored
    // result without doing the work and reports a success that wrote nothing.
    // No foreign keys point here, so it goes last.
    { label: 'claves de idempotencia', sql: `DELETE FROM "OperacionIdempotente" WHERE clave LIKE '${DEMO_PREFIX}%'` },
  ];
}

export async function resetDemo(db: Db): Promise<number> {
  const branchRows = await db.sucursal.findMany({
    where: { codigo: { startsWith: DEMO_PREFIX } },
    select: { id: true },
  });
  const articleRows = await db.articuloInventario.findMany({
    where: { codigo: { startsWith: DEMO_PREFIX } },
    select: { id: true },
  });
  // Empty IN () is a syntax error, so a sentinel keeps the statements valid
  // when a phase is reset before it ever ran.
  const branchIds = branchRows.length ? branchRows.map((b) => b.id) : ['sin-sucursales'];
  const articleIds = articleRows.length ? articleRows.map((a) => a.id) : ['sin-articulos'];

  let removed = 0;
  for (const { label, sql } of statements(branchIds, articleIds)) {
    try {
      removed += await db.$executeRawUnsafe(sql);
    } catch (error) {
      // Naming the step matters: "violates foreign key" alone says nothing
      // about which delete has to move earlier in the order.
      throw Error(`Fallo borrando ${label}: ${(error as Error).message}`);
    }
  }
  return removed;
}
