# REP-A R4/A + R4/B — Acta QA de respuestas DEV (2026-10-30)

**Rama:** `feat/rep-a-reporting`. **PR:** #18 DRAFT, sin merge. **Sucursal:** `cmv8p4k3x0001u4v4xor2zgqu` (Sucursal principal). **Período:** 2026-10-01 a 2026-10-30, `America/Guatemala`, corte 04:00. **Fuente:** 3 payloads de respuesta DEV aportados por el usuario el 30/10/2026 (una solicitud R4/A, dos solicitudes R4/B).

## Resultados R4/A: PREPARATION_COSTS

- Respuesta HTTP con contrato de `PREPARATION_COSTS` y `meta.total=9`, `data.length=9`, `limit=100`, `totalPages=1`.
- **9 documentos** `ConsumoOrden` tipo `RECETA`, **10 líneas** de ingredientes, **0 líneas sin movimiento** y **0 documentos sin líneas**. Todas las líneas observadas tienen `trazabilidadValida=true` con `MovimientoInventario.tipo=CONSUMO`, `referenciaTipo=CONSUMO_ORDEN` e identidad de artículo/lote/ubicación consistente; todos los documentos indican `trazabilidadCompleta=true`.
- Costo total de los 9 documentos por suma independiente: **Q16.928570**, idéntico al `totales.costoRegistrado` y `porTipo[RECETA].costoRegistrado`.
- En el **estado actual** de las órdenes, 3 documentos pertenecen a órdenes `CANCELADA`, suman **Q6.128571**; otros 6 documentos pertenecen a órdenes `CERRADA`, suman **Q10.799999**. Son **costos de consumo histórico**: los Q6.128571 **no deben atribuirse a margen de ventas cerradas**. El dato por estado es una clasificación actual, no un snapshot de estado en el momento del consumo.
- El costo de `ORD-6f19a449-017` (cancelada) es Q3.042857, con dos ingredientes: leche Q1.542857 y extra shot espresso Q1.500000. La receta con modificadores queda reflejada en movimientos históricos.
- Dos consumos del mismo `ORD-e91e29f2-bac` cancelado corresponden a movimientos y documentos distintos, no a un duplicado artificial.

## Resultados R4/B: SALES_COSTS

- Solicitud global: `meta.total=8`, `data.length=8`, `totalPages=1`. **8 `VentaLinea`**, todas `cobertura=COMPLETO`; `lineasConCosto=8`, `lineasSinCosto=0`, `lineasNoAplicables=0`.
- Ingreso neto = **Q154.00**, costo directo asignado = **Q10.799999**, margen exacto **antes de empaque** = **Q143.200001**; `Q154.000000 - Q10.799999 = Q143.200001`.
- El resumen `porProducto` para el único producto de la muestra (`Capuchino de prueba`) concilia con los 8 registros, Q154 ingresos, Q10.799999 costo y Q143.200001 margen.
- División 1 unidad en dos cuentas (`ORD-15226457-44a`, `ordenLineaId=cmvbhqnm0003et8v4g9qa7jnz`): dos ventas de `cantidad=0.500`, ingresos Q11 + Q11, costo **Q0.771429 + Q0.771428 = Q1.542857**. No duplica el movimiento original.
- Otra división 2 unidades (`ORD-22ed731f-96d`): costo **Q1.542857 + Q1.542857 = Q3.085714**, idéntico al consumo de 300 unidades físicas de ingrediente; tampoco se duplica.
- Los documentos consumidos por órdenes cerradas de R4/A coinciden con los IDs originales `documentosConsumo` informados por R4/B y suman **Q10.799999**. Diferencia neta entre costo total consumido y costo directo vendido es **Q6.128571**, explicada íntegramente por los tres documentos con orden actualmente cancelada. No hay costos de `EMPAQUE` observados en esta muestra.
- Paginación independiente: al solicitar `page=1&limit=1` devuelve **1 fila** y `meta.total=8`, `totalPages=8`, manteniendo totales y `porProducto` idénticos al resultado sin paginar. La fila coincide con la primera del lote completo.
- No se detectan campos narrativos `note`, `definition`, `definitions` en la superficie suministrada.

## Gate y límites de la evidencia

**R4/A + R4/B: APROBADOS en revisión aritmética de las 3 respuestas reales de DEV**; el código del HEAD previo `6c1399bccb1520148e03c240330466b72558af41` tuvo GitHub Actions **SUCCESS**, run `41140797667`, con build, unit/HTTP y migration smoke.

No se adjuntaron salidas del Test Runner de Postman, por lo que **no puede asegurarse** que todos los asserts de Postman hayan ejecutado y aprobado. Tampoco se consultó PostgreSQL directamente mediante una conexión independiente, y la muestra no abarca escenarios de permisos negativos, paginación de documentos de consumo, lotes inexistentes, empaques reales, servicios, cancelaciones parciales o sucursales ajenas.

El margen es **antes de empaque, mermas extraordinarias, comisiones y otras cargas**. No llamar a Q143.200001 “ganancia neta” ni ajustar `margenBruto` del dashboard sin cobertura integral.

## Próxima etapa R4/C

Construir y validar el reporte de **empaque por orden, costos de preparación consumidos en órdenes canceladas y conciliación de pérdidas**. Separar las fechas de `ConsumoOrden.creadoEn`, `Venta.cerradaEn` y `Orden.canceladaEn`; no usar una suma interperíodos como si fuera resultado contable. Conservar `null` cuando el empaque debido no pueda acreditarse. Después continuar R5 conciliaciones financieras, R6 multi-sucursal/rendimiento y REP-2 exportaciones reales.

**No merge: PR #18 permanece DRAFT hasta completar los gates y la aprobación explícita.**
