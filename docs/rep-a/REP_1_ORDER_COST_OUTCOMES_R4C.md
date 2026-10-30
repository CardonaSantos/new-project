# Gastro Core REP-1 R4/C — Empaque y consumo en órdenes canceladas

**Rama:** `feat/rep-a-reporting`. **PR #18:** DRAFT, sin merge. **Fecha:** 2026-10-30.

## Nueva fuente

```http
GET /api/reports/analytics/sources/ORDER_COST_OUTCOMES?sucursalId=<id>&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&page=1&limit=100
```

Se integra con el sistema actual de fuentes transversales. Requiere **`reports.read` + `inventory.costs.read` + `orders.read`** en la sucursal, con lectura de solo lectura `REPEATABLE READ` y paginación acotada; no hay nuevas tablas, mutaciones ni migraciones.

## Semántica obligatoria

La cohorte del reporte está determinada por **`ConsumoOrden.creadoEn`**, ajustada a `America/Guatemala` y al corte operativo configurado de la sucursal. Los resultados **NO** agrupan por fecha de venta, ni de cancelación.

- Se lee cada documento original `ConsumoOrden` con `tipo=RECETA|DIRECTO|EMPAQUE` y las `ConsumoOrdenLinea` relacionadas. Se valida la coincidencia con `MovimientoInventario` por `movimientoId`, `tipo=CONSUMO`, `referenciaTipo=CONSUMO_ORDEN`, `referenciaId=ConsumoOrden.id`, artículo, ubicación, lote, y cantidad firmada `MovimientoInventario.cantidad=-ConsumoOrdenLinea.cantidad`.
- Los **costos reales** se toman de `MovimientoInventario.costoTotal` con seis decimales; no se multiplican cantidades por precio actual ni se agregan estimados.
- Los documentos se agrupan una sola vez por **`Orden.id`** y muestran `numeroOrden`, `estadoActual`, `canceladaEn`, `clasificacionCancelacion`, `autorizadaCancelacionPreparada`, `importeAnulado`, `documentosConsumo` y desglose de costo por `RECETA`, `DIRECTO` y `EMPAQUE`.
- **`estadoActual` es el estado al momento de consultar, no una fotografía histórica del estado al consumir.** La clasificación `costoCanceladasIdentificado` solo responde “cuánto costaron los consumos observados de órdenes hoy canceladas”, no es automáticamente la pérdida contable neta del período.
- `costoIdentificado` suma solo movimientos trazables y puede ser **parcial**; cuando falten líneas o movimientos válidos, `costoCompleto=null` en la orden, grupo y total afectados. `documentosIncompletos`, `lineasSinMovimiento` y `documentosSinLineas` señalan la cobertura.
- `costoEmpaqueIdentificado` vale `0.000000` si **no hay documentos de empaque** observados, acompañado de `empaqueRegistrado=false`. Esto **NO** garantiza que el empaque no fuera necesario ni que su costo teórico fuese cero.
- Los totales y el desglose `porEstado` incluyen **todas las órdenes con consumos del período**, independientemente de `page/limit`. Se reportan `costoCanceladasIdentificado`, `costoCerradasIdentificado`, `costoAbiertasIdentificado`. Su suma debe coincidir con `costoIdentificado`, ya que `EstadoOrden=ABIERTA|CERRADA|CANCELADA`.
- El resultado es orientado a auditoría Angular/Excel. No añade `note`, `definition` o `definitions` a las respuestas.

**Muy importante:** `PREPARATION_COSTS` (R4/A), `SALES_COSTS` (R4/B) y `ORDER_COST_OUTCOMES` (R4/C) son **tres perspectivas sobre los mismos movimientos de costo**. Nunca sumarlas entre sí como gastos adicionales.

## Resultados de DEV a conciliar

En R4/A se confirmaron 9 documentos RECETA con costo Q16.928570, repartidos en 6 documentos de órdenes actualmente CERRADA Q10.799999 y 3 documentos de órdenes actualmente CANCELADA Q6.128571. R4/B asigna Q10.799999 a 8 `VentaLinea` por Q154.00 de ingresos, sin duplicación de cuentas divididas. **No hubo empaque registrado en la muestra R4/A.**

La R4/C debería mantener esa clasificación en el mismo intervalo **si nadie modificó los datos entre consultas**, pero no se considera validado hasta ejecutar la consulta real en DEV. El campo `empaqueRegistrado` deberá ser `false` en dicha muestra, no una afirmación de costo total cero del empaque.

## Pruebas y siguiente gate

- Unit tests: coste de receta + empaque de una orden cancelada, agrupación global de órdenes, coste confirmado vs parcial, costo nulo sin datos, estado de empaque ausente.
- Unit test de permisos: prohibir un usuario con reportes y costos pero sin `orders.read`.
- Test HTTP: fuente 11 incorporada al `REPORT_SOURCES`, validación DTO/Pipe existente.
- [Postman R4/C DEV](Gastro_Core_REP_1_ORDER_COST_OUTCOMES_R4_DEV.postman_collection.json): dos solicitudes, global y `limit=1`; verifica conciliación entre estados, tipos, empaque, costos, cobertura y paginación.
- Confirmar GitHub Actions del HEAD real antes de invitar al usuario a sincronizar y probar DEV. El frontend Angular puede consumir esta fuente sin cambios de contrato.

**R4/C es reporte de COSTOS OBSERVADOS.** No activa `margenBruto` o `resultadoNeto` en el dashboard: éstos exigen cierre coherente y reglas contables de imputación de empaques a ventas, pérdidas/cancelaciones, reembolsos, reparto y comisiones. REP-1 R5, R6 y REP-2 continúan pendientes. PR #18 permanece DRAFT.
