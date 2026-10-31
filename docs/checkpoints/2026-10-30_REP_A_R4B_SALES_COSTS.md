# Gastro Core — REP-A R4/B checkpoint: costos atribuibles a líneas vendidas

Fecha: 2026-10-30. PR #18 en DRAFT, rama `feat/rep-a-reporting`, sin merge a `main`.

## Estado de partida

- R3: las 22 respuestas previstas de las colecciones DEV fueron recibidas con estructura/aritmética coherentes; validación independiente SQL de producción pendiente.
- R4/A: fuente `PREPARATION_COSTS` implementada, costos reales desde movimientos, agrupados por documento `ConsumoOrden`; CI completada con éxito en commit `88b024b41b19005b22052e0514506356b4cf5982`. Pendiente Postman real DEV.
- Del día 30/10: Q88 de cuatro pagos vs Q22 de ventas cerradas por diferencias de momento de reconocimiento PAY-A. Verificar estados reales de tres órdenes pagadas sin venta visible el día seleccionado.

## Desarrollo R4/B

Fuente **`SALES_COSTS`** (décima fuente de reportes):

```http
GET /api/reports/analytics/sources/SALES_COSTS?sucursalId=<ID>&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&page=1&limit=100
```

- Implementada en `src/modules/reports/infrastructure/prisma/sales-cost-attribution.ts`, integrada en `domain-reports.store.ts` y `domain-reports.port.ts`.
- Lectura transaccional `REPEATABLE READ`. Requiere `reports.read`, `sales.read` e `inventory.costs.read`, todos de la misma sucursal.
- Filtra `VentaLinea` según **fecha de reconocimiento de `Venta.cerradaEn`**, no fecha de consumo. Reconstruye evidencia por `OrdenLinea` con movimientos históricos reales `MovimientoInventario.costoTotal`, sin filtro temporal sobre la preparación ni precios vigentes.
- Documentos admitidos `RECETA` / `DIRECTO`; se verifica que `ConsumoOrden.ordenId` pertenezca a la misma `OrdenLinea`. Movimientos validados por tipo, referencia, artículo, ubicación, lote y cantidad firmada.
- Para cuentas divididas, `VentaLinea` distintas de una `OrdenLinea` comparten el costo total preparado por fracción de unidades vendidas. Una resta de redondeos acumulados asigna cada microcentavo de costo exactamente una sola vez entre todas las `VentaLinea` de la orden, incluso cuando no todas caen en la fecha de la consulta.
- Validación de cantidades: unidades preparadas en uno o varios `ConsumoOrden` deben igualar unidades vendidas históricas para esa `OrdenLinea`. Si no, `costoDirecto=null` y `margenAntesEmpaque=null`; no se inventa margen.
- Estados de cobertura: `COMPLETO`, `SIN_CONSUMO`, `CONSUMO_INCOMPLETO`, `TIPO_INCOMPATIBLE`, `CANTIDAD_NO_CONCILIA`, `NO_APLICA` (servicios). Un costo registrado de cero con evidencia íntegra es cero real; ausencia de evidencia es `null`.
- Datos: `ventaLineaId`, `ventaId`, `ordenLineaId`, `ordenId`, `numeroOrden`, `productoId`, `varianteId`, `descripcion`, `cantidad`, `ingreso`, `cobertura`, `documentosConsumo`, `costoDirecto`, `margenAntesEmpaque`. `totales` y `porProducto` del período completo, independientes de paginación. `margenAntesEmpaque` global es `null` cuando la cobertura no es íntegra, incluso si hay costos parciales identificables.
- **`margenAntesEmpaque` NO es `margenBruto` general**. R4/B no atribuye `EMPAQUE` de nivel orden, pérdidas por cancelación, comisiones/delivery ni costos complementarios. El dashboard conserva `margenBruto=null` hasta cumplir todos los controles.

## Pruebas y artefactos

- Unit tests añadidos para formato monetario de precisión seis, costo conocido vs cobertura incompleta, ausencia de filas y totales fuera de página, más prueba RBAC triple.
- Test HTTP transversal itera las diez fuentes permitidas.
- [Postman R4/B](../rep-a/Gastro_Core_REP_1_SALES_COSTS_R4_DEV.postman_collection.json) contiene dos solicitudes para universo completo y `limit=1`; verifica sumas por producto, estados de cobertura, nulabilidad de márgenes y costo directo. Requiere ejecución efectiva DEV.
- [Contrato funcional R4/B](../rep-a/REP_1_SALES_COSTS_R4B.md).
- No se ha actualizado `prisma/schema.prisma`, ni ejecutado migración, ni modificado transacciones de escrituras de inventario, pagos o caja.

## Gates pendientes

1. Confirmar la **CI del último HEAD**, build, Vitest, HTTP, migration smoke. Las CI de commits parciales son transitorias; no confundirlas con aprobación final.
2. Ejecutar **Postman R4/A** `PREPARATION_COSTS` y **Postman R4/B** `SALES_COSTS` contra DEV y revisar ejemplos de cuentas divididas, preparaciones parciales, servicios y registros incompletos.
3. Ejecutar SQL de comprobación de ventas Q88 cobradas vs Q22 registradas en la fecha, revisar estados de cuentas/órdenes.
4. R4/C: costos de empaque a nivel orden, registros no vendidos/cancelados y margen completo; verificar consolidación a `Venta` y `Orden` antes de reemplazar margen global `null`.
5. R5: conciliaciones financieras, delivery, comisiones, proveedores, reembolsos/clientes. R6: multibranch, RBAC, escala y rendimiento. REP-2: exportación XLSX/CSV/PDF y aceptación.
6. Mantener PR #18 DRAFT sin merge hasta aprobar todos los gates.
