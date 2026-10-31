# Gastro Core — REP-A R4/C: revisión de respuestas DEV

Fecha de revisión: 2026-10-30. Rama `feat/rep-a-reporting`, PR #18 DRAFT (sin merge). Evidencia: **dos respuestas JSON** de `ORDER_COST_OUTCOMES` proporcionadas por el usuario, 2026-10-30 23:11:53Z y 23:12:31Z; mismas sucursal y período.

## Parámetros y resultado global

- Sucursal: `cmv8p4k3x0001u4v4xor2zgqu` / Sucursal principal. Moneda GTQ. Intervalo 2026-10-01–2026-10-30, `America/Guatemala`, corte 04:00.
- `total=8` órdenes, **9** `ConsumoOrden` (los nueve son `RECETA`), 10 líneas. `lineasSinMovimiento=0`, `documentosSinLineas=0`, `documentosIncompletos=0`, `ordenesIncompletas=0`.
- `costoIdentificado=16.928570` y `costoCompleto=16.928570`. Suma independiente de los 8 `data[].costoIdentificado`: **16.928570**. Los 9 `documentosConsumo` son distintos; coinciden cardinalidades de documentos, tipos y referencias por orden.
- `documentosEmpaque=0`, `costoEmpaqueIdentificado=0.000000`, `empaqueRegistrado=false` en resumen y en cada orden. Esto significa **no hay empaque registrado en esta muestra**, no significa que el empaque necesario o estimado sea cero.
- Estados **actuales**: 6 órdenes `CERRADA`, 6 documentos y costo **10.799999**; 2 órdenes `CANCELADA`, 3 documentos y costo **6.128571**; 0 órdenes `ABIERTA`. `10.799999+6.128571=16.928570`, exacto a seis decimales.
- `porEstado` agrupa exactamente las 8 órdenes, 9 documentos y 16.928570 de la muestra.
- Todos los documentos de cada orden concilian `costoRecetasIdentificado + costoDirectoIdentificado + costoEmpaqueIdentificado = costoIdentificado`, con `costoCompleto=costoIdentificado`.
- Cuentas canceladas con consumo: `ORD-6f19a449-017` (1 documento, Q3.042857, `clasificacionCancelacion=MERMA_OPERATIVA`, `autorizadaCancelacionPreparada=true`, `importeAnulado=27.00`), y `ORD-e91e29f2-bac` (2 documentos, Q3.085714, clasificación `null`, autorización `false`, importe anulado Q0). Estos son registros en DEV; la segunda orden merece una **revisión de trazabilidad de su clasificación de cancelación**, sin afirmar un bug de política sin conocer la fecha/flujo de captura.
- `page=1&limit=100` devuelve 8 filas, `meta.total=8`, `totalPages=1`. `page=1&limit=1` devuelve una única primera fila idéntica a la primera del lote completo, `meta.total=8`, `totalPages=8`, y **mantiene exactamente iguales `totales` y `porEstado`**.
- Todo lo anterior concilia con evidencia previa R4/A y R4/B: 9 consumos por Q16.928570, venta atribuida Q10.799999 y costo de consumos de órdenes canceladas Q6.128571. Las tres fuentes consultan **los mismos costos**, no son tres gastos acumulables.

## Resultado y límites

**Gate R4/C — RESPUESTAS DEV: APROBADO** con las dos cargas recibidas. Se han contrastado aritmética de precisión seis, 8 filas, 9 referencias originales sin repetición, dos órdenes canceladas, cero empaque registrado, cobertura íntegra y paginación. La última CI del commit `3020649fa55e457b8dd394981d488c78f13cd87e` terminó **SUCCESS**, workflow `41142584452` (build, Vitest, HTTP, migration-smoke, SQL de reportes contra PostgreSQL migrado).

**No constituye** una captura del runner Postman con afirmaciones ejecutadas, una conciliación SQL independiente del usuario sobre la BD DEV ni un caso positivo de `EMPAQUE`. Falta validar: consumo DIRECTO, empaque real, negativos RBAC y sucursal no autorizada, fecha operativa en límites, pérdida parcial por cancelación. El `estadoActual` refleja estado en la consulta, no estado a fecha de consumo. Los importes de órdenes canceladas son **costos identificados de consumo**, no pérdida neta contable ya reconciliada con reembolsos.

## Situación del módulo

R4/A, R4/B y R4/C ya cuentan con código y revisión de respuestas reales en DEV. REP-A **sigue abierto**: R5 conciliación financiera/proveedores/plataformas, R6 multi-sucursal/RBAC/rendimiento y REP-2 exportaciones Excel/CSV/PDF, además de las pruebas de cobertura pendientes. Mantener PR #18 DRAFT y sin merge hasta completar los gates y contar con autorización expresa.

No es necesario actualizar la rama local para consumir este documento; se agrega documentación de evidencia.
