# Gastro Core — REP-A: checkpoint de trazabilidad y cobertura transversal

Fecha: 2026-10-30. Rama: `feat/rep-a-reporting`. PR #18: https://github.com/CardonaSantos/new-project/pull/18 (**DRAFT**, no merge). Main sigue con RSV-A y no recibe cambios REP-A.

## Nueva validación manual DEV

El usuario ejecutó en DEV `GET /api/reports/analytics/cash-shifts/cmvv3hupg0009fov4ji0uaci8/evidence`. Resultado: 3 movimientos `INGRESO` de Q22 cada uno, total Q66 y 0 egresos, todas las fuentes son `LIQUIDACION_REPARTIDOR` con documentos cerrados y `totalEsperado=totalEntregado=22.00` (referencias `cmvv3q7ba0017fov4dhobacwp`, `cmvv5zawd001e4gv47fd8x94w`, `cmvv7lmbg00025gv4camb9s06`). Las tres salidas tienen movimientos, fecha, actor y referencia original. Esto demuestra caja ← liquidación, **no** todavía liquidación ← Pago hasta leer `fuente.lineas` ampliadas. Tampoco implica ingresos nuevos adicionales a ventas.

## Política estricta de payload UI

El usuario pidió eliminar propiedades narrativas que no se usarán en Angular. Se eliminaron `note`, `definicion`, `definition`, `definitions` de todas las respuestas HTTP en `ReportingStore` y `ReportEvidenceStore`. Se mantienen únicamente datos de negocio, `totales`, `data`, `meta`, fechas/periodo, IDs, enlaces, datos fuente, actores, documentos y `generatedAt`; campos `notaCierre` o `detalle` son **datos transaccionales** reales, no comentarios inventados.

## Implementación ampliada

- `ReportEvidenceStore`: línea de `LIQUIDACION_REPARTIDOR` ahora expone, por cada `LiquidacionRepartidorLinea`, `pagoId`, `cuentaId`, `entregaId`, `ordenId`, `numeroOrden`, `monto` y fechas. Test unitario de liquidación→Pago→Orden y RBAC.
- `DomainReportsPort/Service/Store/Controller` hexagonal, con consulta `GET /api/reports/analytics/sources/:source`, filtros día/semana/mes/personalizado, zona/corte por sucursal, RBAC obligatorio `reports.read` + permiso de fuente y snapshot REPEATABLE READ.
- Fuentes: `SALES_LINES`, `INVENTORY_MOVEMENTS`, `PURCHASE_INVOICES`, `PURCHASE_RECEIPT_LINES`, `DELIVERY_EVENTS`, `RESERVATION_EVENTS`, `SUPPLY_REQUESTS`, `SUPPLY_TRANSFERS`. Cada respuesta incluye registros individuales verificables con IDs, estado, fechas y relaciones que existan, y totales del período completo.
- `SALES_LINES`: `porProducto` y `porCategoria` calculados en PostgreSQL sobre todo el período (NO sobre la página actual), cantidad, descuentos e importes, con test de suma frente a `VentaLinea`.
- Inventario: costo registrado por `TipoMovimientoInventario`; no inferir margen real desde un simple movimiento.
- Facturas de proveedor: agrupadas por estado **actual** y `creadaEn`; documentos BORRADOR no se interpretan como pagos. Recepciones confirmadas por `recibidoEn` se mantienen separadas.
- Delivery y RSV: evento histórico por `creadoEn`, con acción/actor/documento. `Reserva.estado` de la relación es **actual**, no reconstrucción del pasado.
- Supply: requisiciones por fecha de creación y despacho de transferencias por fecha `despachadaEn` del almacén ORIGEN, diferenciadas de recibos.

## QA disponible

- [Colección ampliada de reporte caja / ventas / pagos / gastos (13 requests)](https://github.com/CardonaSantos/new-project/blob/feat/rep-a-reporting/docs/rep-a/Gastro_Core_REP_1_INITIAL_DEV.postman_collection.json): incluye control de `fuente.lineas` para liquidaciones y ausencia de notas.
- [Nueva colección transversal (9 requests)](https://github.com/CardonaSantos/new-project/blob/feat/rep-a-reporting/docs/rep-a/Gastro_Core_REP_1_TRANSVERSAL_DEV.postman_collection.json): ocho fuentes y un error 400 esperado, prueba sumas de chart por producto/categoría frente a líneas, IDs, importes, períodos y paginación.
- [Catálogo técnico de fuentes y fechas](https://github.com/CardonaSantos/new-project/blob/feat/rep-a-reporting/docs/rep-a/REP_1_TRANSVERSAL_SOURCE_CATALOG.md).
- Tests nuevos para contratos HTTP, precisión Decimal, documentos BORRADOR, aislamiento por permisos, enlace liquidación→documentos, cálculo por período completo.

## Gate de DEV y estado

CI de este HEAD se registra/valida en PR antes de aceptación; no atribuir código a main.

Pendientes:
1. Ejecutar ambas colecciones en PostgreSQL DEV y cotejar **registros reales**.
2. Cobertura restante REP-1: costo de consumo histórico/márgenes, reportes de cobranzas delivery y comisiones externas, inventario actual/stock valorizado, compras/retornos y obligaciones, bancos/conciliación, clientes, comparaciones multi-sucursal con autorización explícita, indicadores avanzados y performance.
3. **REP-2**: generadores XLSX reales con celdas numéricas/fórmulas y hojas de transacciones originales + CSV/PDF, exportación reproducible de un único snapshot, control de permisos/PII, protección contra inyección de fórmulas y sin truncamiento.
4. QA funcional/contable contra PostgreSQL DEV y aceptación del propietario antes de fusionar.

Ningún pago, caja, inventario o entrega se modificó por esta implementación: todos los nuevos endpoints son GET de solo lectura. No merge.
