# Gastro Core — REP-A · Auditoría inicial de fuentes y contrato de reporte (30/10/2026)

## Objetivo validado por el propietario

**Dos submódulos sobre un motor compartido:**
- REP-1 Analytics: dashboard OPERATIVO (lectura actual de estados) y dashboard ANALÍTICO (DIA/SEMANA/MES/PERSONALIZADO), charts, tablas de detalle e indicadores trazables.
- REP-2 Exports: XLSX real editable con fórmulas, CSV y PDF imprimible, **los mismos datos y las mismas reglas** que REP-1.

Práctica de negocio: Guatemala, moneda GTQ, zona America/Guatemala; respetar la configuración existente \`ConfiguracionSucursal.horaCorteOperativo\` (default 04:00). Semana de lunes a domingo. Rango personalizado inclusivo por fechas **operativas** con límite inicial de 366 días. Los períodos se materializan con límites UTC [desde, hasta exclusivo). No inventar cifras para períodos sin datos.

## Esquema auditado

\`prisma/schema.prisma\` contiene **126 modelos** al momento del diseño. La siguiente matriz destaca fuentes de verdad, sin asumir que sumarlas constituye un total financiero:

| Familia de información | Tablas verificadas | Política de medición |
| --- | --- | --- |
| Ventas reconocidas | \`Venta\`, \`VentaLinea\`, \`Cuenta\`, \`Orden\` | \`Venta.cerradaEn\` y \`Venta.total\`; una \`Venta\` por cuenta, ticket = orden distinta. \`Orden.total\` no se añade otra vez |
| Cobros recibidos | \`Pago\`, \`ReembolsoPago\`, \`IntentoPago\` | \`Pago.cobradoEn\` menos reembolsos según \`ReembolsoPago.creadoEn\`. Los intentos no son ingresos |
| Caja y arqueos | \`TurnoCaja\`, \`MovimientoCaja\`, \`ArqueoCaja\`, \`Caja\` | Día operativo del turno, efectivo esperado vs contado, diferencia solo en turnos cerrados; no sumar movimientos como ventas nuevas |
| Gastos y bancos | \`GastoOperativo\`, \`MovimientoFinanciero\`, \`CuentaFinanciera\`, \`CierreOperativo\` | Gastos registrados, movimientos financieros y saldo bancario son series distintas. Reversas según su ledger |
| Costo real / recetas | \`ConsumoOrdenLinea\`, \`MovimientoInventario\`, \`CapaCostoInventario\`, \`AplicacionCapaCosto\`, \`RecetaVersion\` | Costo histórico de consumo, no sustituir con receta o precio actual. No asumir que compras son consumos |
| Compras | \`OrdenCompra\`, \`RecepcionCompra\`, \`FacturaProveedor\`, \`PagoProveedor\`, \`NotaCreditoProveedor\`, \`DevolucionProveedor\` | Obligaciones, entradas de inventario y pagos son hechos distintos. No duplicar importes |
| Supply | \`Requisicion\`, \`TransferenciaInventario\`, sus líneas y movimientos | Movimiento entre ubicaciones no es venta ni ingreso |
| Delivery | \`Entrega\`, \`LiquidacionRepartidor\`, \`LiquidacionCanalExterno\` y líneas | Entrega, cobro y comisión tienen fechas y fuentes distintas |
| Reservas y mesas | \`Reserva\`, \`ReservaMesa\`, \`OcupacionMesa\`, \`EventoReserva\` | \`COMPLETADA\` en Reserva = llegada/check-in, no cuenta cobrada |
| Usuarios y auditoría | \`Usuario\`, \`UsuarioRol\`, \`EventoAuditoria\` | Actividad y seguridad por sucursal, NO productividad horaria no registrada |

### Contratos y advertencias

- \`GET /api/reports/operational/dashboard?sucursalId=\` expone recuentos **actuales** de pedidos ABIERTA, comandas PENDIENTE/PREPARANDO, ocupaciones sin cierre, entregas EN_REPARTO, reservas próximas (120 minutos) y turnos sin cierre; sin confundirlos con ingresos.
- \`GET /api/reports/analytics/overview?sucursalId=&periodo=DIA&fecha=2026-10-30\` para resumen y \`serieDiaria\`; \`SEMANA\` (lunes a domingo), \`MES\` y \`PERSONALIZADO&desde=&hasta=\`. Devuelve importes como strings decimales exactos, números de tickets/ventas como enteros, definición de cada métrica y metadata de fuentes, zona, corte y rango.
- \`GET /api/reports/analytics/tickets?sucursalId=&periodo=DIA&fecha=2026-10-30&page=1&limit=20\` devuelve ventas internas enriquecidas con número de orden, nombre de responsable y cliente (cuando existe), modalidad y estado, paginación con límite 100. Una fila = Venta/cuenta; un ticket = Orden distinta.
- \`reports.read\` ya existe en seed y es **obligatorio por sucursal**. Se requiere introducir permisos adicionales de reporte financiero/costo/exportación en futuros cortes; actualmente se reservará \`reports.read\` para roles autorizados y no se expondrá información personal ajena a la sucursal.
- \`margenBruto\` y \`resultadoNeto\` **null** hasta construir y reconciliar las fuentes de costos y finanzas; nunca suponer 100% margen ni fabricar gastos ausentes.
- \`no-store\` en rutas REP-1 iniciales para no mostrar datos obsoletos. Analytics y exports se implementarán con la misma instantánea temporal cuando exista interfaz de exportación.

### Antipatrones expresamente prohibidos

1. Sumar \`Venta.total + Pago.monto + MovimientoCaja.monto\` como ingresos.
2. Contar factura de proveedor, recepción y consumo como el mismo gasto.
3. Calcular margen de producto con costoReferencia presente, sin validar trazabilidad de consumo histórico.
4. Contar varias \`Venta\` de cuentas divididas como varios tickets del restaurante.
5. Reagrupar a medianoche ignorando corte operativo 04:00 o cambio de horario.
6. Retornar cero para un margen no calculado por datos faltantes.
7. Hacer el Excel con números precalculados como texto o fórmulas pegadas desde celdas editadas por clientes.
8. Consultar todas las sucursales sin RBAC explícito por cada sede.

## Roadmap / alcance que todavía NO se ha implementado

**Este checkpoint inicia REP-1, NO lo completa.** El primer corte incluye dashboard operativo, overview de ventas/cobros/reembolsos/gastos/caja y tickets paginados para una sucursal. Las series diarias se calculan en PostgreSQL con agrupamiento según fecha operativa y no se hacen agregaciones manuales en Angular.

Pendientes de REP-1: analítica transversal de inventario, compras, supply, delivery, recetas, reservas y auditoría; desglose por método de pago, producto, categoría, cajero y turno; comparativa multi-sucursal autorizada; drilldown a cada movimiento; conciliaciones completas, rendimiento, índices y filtros adicionales. No usar el porcentaje 15/16 hasta que todo esté implementado y probado.

REP-2 todavía pendiente: **Excel XLSX con fórmulas editables** (libro resumen + hojas origen, metadatos, IDs auditables), CSV, PDF, export jobs para cargas grandes y sanitización de fórmulas CSV/Excel. Reutilizar aplicación/ports de REP-1.

### Aceptación de cada corte

Compilar \`npm run build\`;  unitarias \`npm test\`; HTTP \`npm run test:e2e\`; \`prisma validate\`; CI PostgreSQL migration-smoke. Luego importar colección DEV, comprobar fechas GT (incluido cierre 04:00), total vs transacciones base, permisos 403 y zonas/sucursales. Reportes Excel deben abrirse correctamente en Excel/LibreOffice y recálcularse cuando el usuario cambie cantidades, sin modificar PostgreSQL.

Rama: \`feat/rep-a-reporting\`. PR en borrador, SIN merge antes de REP-1 y REP-2 completamente aceptados.
