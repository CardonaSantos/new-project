# Gastro Core — REP-A / REP-1 R4/B: costo real por línea de venta

Fecha: 2026-10-30. Rama `feat/rep-a-reporting` y PR #18 DRAFT. Este bloque **no cierra** el módulo ni modifica `main`.

## Endpoint

```http
GET /api/reports/analytics/sources/SALES_COSTS?sucursalId=<id>&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&page=1&limit=100
```

Requiere simultáneamente `reports.read`, `sales.read` e **`inventory.costs.read`**. Lectura PostgreSQL `REPEATABLE READ`, fecha operativa por sucursal, paginación máxima 100. No realiza escrituras ni migraciones.

## Contrato de reconocimiento y atribución

- Universo comercial: `VentaLinea` asociada a `Venta.cerradaEn` durante el período y sucursal seleccionados.
- Origen del costo: `ConsumoOrden` de tipos `RECETA` (producto preparado) y `DIRECTO` (producto inventariable), `ConsumoOrdenLinea` y `MovimientoInventario.costoTotal` registrado (6 decimales), mediante `OrdenLinea`. No se usa el precio de venta, receta vigente, costo promedio actual ni se reconstruye con cantidades multiplicadas por precios redondeados.
- La evidencia se valida por `movimientoId`, tipo `CONSUMO`, `referenciaTipo=CONSUMO_ORDEN`, `referenciaId`, artículo, ubicación, lote y cantidad negativa del movimiento. La cantidad `ConsumoOrden.cantidadPreparada` debe conciliar con **todas** las unidades `VentaLinea.cantidad` de su `OrdenLinea` en cualquier fecha.
- Para cuenta dividida, el costo registrado de cada `OrdenLinea` se reparte entre **todas** las `VentaLinea` por peso de cantidad vendida. Se acumulan cantidades ordenadas por ID de línea y se asigna la diferencia entre redondeos acumulados a 6 decimales. Esto asegura que la suma de asignaciones de la línea comercial sea el costo registrado, sin duplicación ni pérdidas de centésimas por división.
- `SERVICIO` se distingue como `NO_APLICA`: no se inventa costo 0 ni margen.
- Si faltan documentos, movimientos, cantidades, o no concilian las unidades preparadas/vendidas, la fila queda con `costoDirecto=null` y `margenAntesEmpaque=null`. Motivos de `cobertura`: `COMPLETO`, `SIN_CONSUMO`, `CONSUMO_INCOMPLETO`, `TIPO_INCOMPATIBLE`, `CANTIDAD_NO_CONCILIA`, `NO_APLICA`.
- `margenAntesEmpaque` es **ingreso neto de la línea menos costo directo de ingredientes/SKU consumido**, antes de empaque a nivel de orden, posibles costos complementarios y tratamientos contables. No es aún el margen bruto total de la operación y NO reemplaza `margenBruto=null` del dashboard.
- Los agregados son globales para el período y no dependen del tamaño de página. `costoDirectoIdentificado` suma **solo filas cubiertas**, lo cual es un subtotal de costos comprobados. `margenAntesEmpaque` global es `null` si alguna fila está incompleta o no aplica; igual regla para `porProducto`.
- `documentosConsumo` en cada línea enlaza a los ID originales que pueden consultarse en la fuente `PREPARATION_COSTS`. Las listas pueden repetir los mismos IDs entre líneas fraccionadas porque el costo se **distribuye**, no porque existan consumos adicionales.
- `EMPAQUE` de `ConsumoOrden` suele estar a nivel `Orden` y se informa en `PREPARATION_COSTS` aparte. No se atribuye arbitrariamente a cada variante o producto en R4/B. Tampoco se incluyen aquí costos de preparación cancelada sin ventas, mermas independientes, devoluciones ni comisiones de plataforma.

## Tests y bloqueos

- Pruebas unitarias: importes a 6 decimales, `margenAntesEmpaque=null` ante evidencia insuficiente, paginación, permiso `inventory.costs.read` negado con `reports.read` + `sales.read` presentes.
- [Colección DEV de dos solicitudes](Gastro_Core_REP_1_SALES_COSTS_R4_DEV.postman_collection.json) confirma estructura, dimensiones por producto, sumas globales, cobertura, `limit=1` y márgenes. **Falta ejecutar contra la base PostgreSQL DEV de Gastro Core y remitir salida**.
- Ejecutar reconciliación SQL independiente: cada `VentaLinea` asignada debe tener documentos y movimientos válidos; totales por `OrdenLinea` no pueden exceder el costo registrado y deben coincidir cuando cobertura completa, incluso si `Cuenta` se divide.
- Revisar particularmente 3 órdenes delivery pagadas el 30/10 pero no cerradas como `Venta` dentro del día, y el empacado a nivel orden. El costo de consumo se reconoce en preparación y el costo atribuible a venta en cierre, **no sumar ambos como gastos del mismo período**.
- Permanece pendiente R4/C empaque y tratamientos de costo no vendido, R5 conciliación, R6 multi-sucursal/performance, REP-2 XLSX/CSV/PDF. No merge sin CI y DEV completos.
