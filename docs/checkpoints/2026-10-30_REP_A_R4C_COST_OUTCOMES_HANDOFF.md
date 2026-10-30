# Gastro Core REP-A — Checkpoint R4/C (Empaque y consumos cancelados)

**Fecha:** 2026-10-30. **Repositorio:** `CardonaSantos/new-project`. **Rama:** `feat/rep-a-reporting`. **PR:** #18 DRAFT, no merge a `main`.

## Punto de partida validado en DEV

- R3: 22/22 respuestas HTTP esperadas de ambas colecciones transversales/iniciales, sin reporte del runner Postman ni SQL independiente.
- R4/A `PREPARATION_COSTS` (9 documentos RECETA, 10 líneas trazadas, 0 faltantes) **Q16.928570** costo de consumo. 3 documentos de órdenes actualmente `CANCELADA`: **Q6.128571**; 6 de órdenes `CERRADA`: **Q10.799999**.
- R4/B `SALES_COSTS`: 8 `VentaLinea`, **Q154.00** ingresos, **Q10.799999** costo directo y **Q143.200001** margen antes de empaque. Paginación `limit=1` mantiene totales; cuentas divididas asignan microdecimales sin pérdida (Q0.771429+Q0.771428=Q1.542857).
- Estado de GitHub Actions anterior R4/B `6c1399bccb1520148e03c240330466b72558af41`: SUCCESS (`run 41140797667`). Acta: `docs/rep-a/2026-10-30_REP_A_R4_DEV_RESPONSE_REVIEW.md`.

## Desarrollo de R4/C incorporado en rama

Se agregó fuente 11, `ORDER_COST_OUTCOMES`, sin migraciones ni escrituras.

- `src/modules/reports/infrastructure/prisma/order-cost-outcomes.ts`: CTE PostgreSQL que suma por `ConsumoOrden.id` costos reales de `MovimientoInventario.costoTotal`, valida movimiento por tipo/referencia/artículo/ubicación/lote/**cantidad firmada**, consolida por `Orden` y produce detalle paginado, resumen global independiente de página y agrupación por **estado actual** `ABIERTA|CERRADA|CANCELADA`.
- Distingue `RECETA`, `DIRECTO` y `EMPAQUE`, documentos/lineas, documentos incompletos, líneas sin movimiento, costos identificados, costo total íntegro **null** ante cobertura incompleta, estado `empaqueRegistrado` explícito para diferenciar que no haya documentos vs costo cero documentado.
- `src/modules/reports/application/ports/domain-reports.port.ts`: fuente en allowlist.
- `src/modules/reports/infrastructure/prisma/domain-reports.store.ts`: integración y RBAC triple `reports.read`, `inventory.costs.read`, `orders.read`; contexto de sucursal, período y lectura `REPEATABLE READ`.
- `src/modules/reports/infrastructure/prisma/order-cost-outcomes.spec.ts`: pruebas unitarias costo/cancelación/empaque, período vacío y trazabilidad incompleta.
- `src/modules/reports/infrastructure/prisma/domain-reports.store.spec.ts`: denegación de acceso sin `orders.read`.
- `test/domain-reports.e2e-spec.ts`: once fuentes HTTP.
- Nueva colección `docs/rep-a/Gastro_Core_REP_1_ORDER_COST_OUTCOMES_R4_DEV.postman_collection.json`: dos solicitudes para la fuente, `limit=100` y `limit=1`, con asserts de costos a seis decimales, estados, completitud y globales.
- Contrato: `docs/rep-a/REP_1_ORDER_COST_OUTCOMES_R4C.md`.

## Reglas de auditoría

**No** calcular margen bruto global sumando las tres fuentes: R4/A (preparación), R4/B (ventas) y R4/C (resultado actual de orden) comparten exactamente los movimientos originales. `estadoActual` no es el estado histórico del día consumido; `costoCanceladasIdentificado` no es un resultado neto contable por sí mismo. El detalle R4/C se filtra por fecha de consumo, no por `Orden.canceladaEn` ni por `Venta.cerradaEn`. Un orden sin ningún documento de empaque se identifica con `empaqueRegistrado=false`, sin fingir que el empaque debido fue cero.

## Validación necesaria antes de continuar

1. Confirmar GitHub Actions del último HEAD R4/C: validación Prisma/build, Vitest, HTTP, migración smoke. No confundir fallos de commits intermedios antes de completar integración con el estado final.
2. **Solo después de CI exitosa**, solicitar al usuario traer rama actual a local: `git status`, `git fetch origin`, `git switch feat/rep-a-reporting`, `git pull --ff-only origin feat/rep-a-reporting`, `npx prisma generate`, `npm run start:dev` (si no está levantado).
3. Ejecutar colección **R4/C** con `sucursalId=cmv8p4k3x0001u4v4xor2zgqu`, período 2026-10-01..2026-10-30, con token de permisos triple.
4. Validar que, si DEV no cambió, `totales.costoIdentificado=16.928570`, `costoCerradasIdentificado=10.799999`, `costoCanceladasIdentificado=6.128571`, `documentosEmpaque=0`, `empaqueRegistrado=false`, y paginación de lista con total global. Estos son **valores esperados a verificar**, no resultados verificados.
5. Pendiente transversal: diagnosticar 3 órdenes con pago Q66 fuera de `Venta` de día; pruebas RBAC cruzadas, SQL independiente, rendimiento, R5 finanzas, R6 multibranch, REP-2 XLSX/CSV/PDF. **No merge** sin aprobación.

El usuario pidió que trabajemos en GitHub hasta llegar a una prueba local imprescindible. Por tanto, no solicitar nueva sincronización por cada commit, solo al terminar el bloque con CI y Postman preparado.
