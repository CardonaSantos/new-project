# Gastro Core REP-A — R4/A: trazabilidad de costo histórico de consumo

Fecha: 2026-10-30. Rama `feat/rep-a-reporting`. PR #18 DRAFT, sin merge.

## Endpoint nuevo

```http
GET /api/reports/analytics/sources/PREPARATION_COSTS?sucursalId=<id>&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&page=1&limit=100
```

Requiere simultáneamente `reports.read` y **`inventory.costs.read`**, según sucursal real. No requiere nuevos permisos, migración ni mutaciones. Usa transacción PostgreSQL `REPEATABLE READ` y rango de fecha operativa, zona horaria y hora de corte de la sucursal. Paginación de documentos hasta 100 por petición; totales y agrupaciones calculados sobre el **período completo**.

## Fuente del costo y validación

- `ConsumoOrden` es el documento de consumo, enlazado con `Orden` y, opcionalmente, `OrdenLinea` y `ComandaLinea`.
- `ConsumoOrdenLinea` conserva artículo, ubicación, lote, cantidad y costo unitario registrado; su `movimientoId` identifica al movimiento contable físico.
- **El importe de costo proviene directamente de `MovimientoInventario.costoTotal` (Decimal a seis decimales)**, y no del producto comercial o de multiplicar costo unitario ya redondeado por cantidad. El movimiento se valida con `tipo=CONSUMO`, `referenciaTipo=CONSUMO_ORDEN`, `referenciaId=ConsumoOrden.id` y vínculo `movimientoId`.
- Los documentos `RECETA` incluyen modificación real de ingredientes a través de los movimientos registrados. `DIRECTO` documenta venta inventariable. `EMPAQUE` es **consumo a nivel de orden** (`ordenLineaId=null`): no se distribuye arbitrariamente entre productos o cuentas.
- `lineasSinMovimiento` contabiliza líneas que carecen de un movimiento **válido y relacionado**. `documentosSinLineas` detecta consumos sin detalle de ingredientes o empaque. La validación cruza además ID de artículo, ubicación y lote, no solo el identificador del movimiento. Cada fila devuelve `trazabilidadValida` y documento `trazabilidadCompleta`. Si faltan líneas o existen vínculos inválidos, `costoRegistrado` del **documento** es `null`, no Q0.
- `totales.costoRegistrado` y `porTipo[].costoRegistrado` son suma de **movimientos válidos encontrados**, no una declaración de cobertura completa. Verificar simultáneamente `lineasSinMovimiento` y documentos sin detalle para juzgar completitud.
- Se muestran `id`, `orden`, `ordenLinea`, `recetaVersionId`, `cantidadPreparada`, `articulo`, `movimientoId`, `movimiento`, `costoUnitarioHistorico` y `costoMovimiento` para auditoría real y futura exportación.

## Semántica y guardas

1. La selección se hace por fecha de **consumo** `ConsumoOrden.creadoEn`. Las ventas se seleccionan por `Venta.cerradaEn` y los pagos por `Pago.cobradoEn`. Por eso **no** se puede restar directamente este total al importe de `SALES_LINES` de igual fecha.
2. El consumo puede corresponder a una orden pendiente de facturar/cerrar, empaque o producto cancelado tras preparación. Sus costos **no equivalen automáticamente a COGS reconocido de ventas**.
3. Un producto vendible puede tener varias `VentaLinea` por divisiones de cuenta y múltiples consumos parciales. R4/B requiere una regla de atribución a unidades vendidas, trazabilidad, cancelaciones, redondeo en precisión seis y pruebas de reconciliación contra movimientos, antes de calcular el verdadero margen bruto.
4. Ninguna propiedad narrativo-editorial `note`, `definition`, `definitions` se añade al JSON de Angular.

## Pruebas

- Unit tests del store para costo de movimiento Q1.542857 (distinto de `0.010286 × 150` por redondeo), documentos RECETA/EMPAQUE y ausencia de movimiento.
- Unit test permiso `inventory.costs.read` faltante, sin acceso a datos.
- [Colección Postman DEV R4](Gastro_Core_REP_1_COSTS_R4_DEV.postman_collection.json): valida la fuente, su paginación, costos a 6 decimales, conciliación por tipo y vínculos de movimientos. **Debe ejecutarse en DEV tras desplegar rama para obtener evidencia real**.
- CI deberá aprobar build, unit, HTTP y migration-smoke en el HEAD funcional; no declarar QA DEV sin recibir respuestas reales.

## Siguiente implementación

R4/B: asignar costos a `VentaLinea` sin duplicar consumos de `OrdenLinea` en cuentas divididas. Exponer costo vendido, costo no asignado a ventas (preparación cancelada/exceso), costos de empaque a nivel pedido, cobertura de costo `COMPLETA|INCOMPLETA`, márgenes `null` cuando no hay evidencia íntegra, agrupaciones por artículo comercial y dimensiones. Se requiere revisar específicamente pedidos pagados Q88 vs ventas cerradas Q22 del 30/10 y coherencia de fecha de reconocimiento.

No hacer merge del PR #18 hasta completar REP-1 y REP-2 y recibir aprobación explícita.
