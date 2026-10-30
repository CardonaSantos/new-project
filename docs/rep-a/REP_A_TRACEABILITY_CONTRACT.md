# REP-A — Contrato de evidencia y trazabilidad (Cash / Payments / Expenses)

Fecha: 2026-10-30. Rama `feat/rep-a-reporting`. El PR #18 permanece DRAFT. Se agregan **consultas de detalle orientadas tanto a Angular como al futuro Excel**. No se ha implementado aún un exportador XLSX real.

## Decisión de producto

**Los resúmenes para UI son deliberadamente ligeros, pero nunca sustituyen los registros originales del reporte.** Todo total financiero debe tener:
- una **métrica con regla de reconocimiento** y filtros por fecha operativa;
- detalle de origen trazable a una tabla transaccional real y su ID;
- documentación relacionada (Pago, Cuenta, Orden, ReembolsoPago, GastoOperativo, PagoProveedor, LiquidacionRepartidor);
- fecha/hora y actor de la operación, monto con Decimal, estado y motivo cuando aplique;
- reconciliación con sumas de origen dentro de una lectura consistente, y permisos de sucursal.

## Endpoints de evidencia implementados

| Endpoint | Resumen de origen | Permisos |
| --- | --- | --- |
| `GET /api/reports/analytics/cash-shifts/:id/evidence?sucursalId=&page=1&limit=20[&tipo=INGRESO]` | Turno, caja/cajero, arqueo, movimientos `MovimientoCaja` cronológicos; `movimientoId`, `monto`, `motivo`, `registradoPor` y `fuente` real con ID y cuenta/orden/documento enlazado; ingresos/egresos y conteos de **todo el filtro**, no de la página | `reports.read` + `cash.read` |
| `GET /api/reports/analytics/payments/records?sucursalId=&periodo=DIA&fecha=...&page=&limit=` | Pago individual con `pagoId`, `cuentaId`, `ordenId`, número de pedido, método, referencia, actor, movimiento de caja y reembolsos relacionados con sus fechas | `reports.read` + `payments.read` |
| `GET /api/reports/analytics/expenses/records?sucursalId=&periodo=DIA&fecha=...&page=&limit=` | Gasto individual con `gastoId`, importe, tipo, categoría, referencia de documento, proveedor, usuario, `movimientoCajaId` si aplica | `reports.read` + `finance.expenses.read` |

Todas las listas limitan la página a 100 elementos; las consultas usan una transacción REPEATABLE READ, y filtros de sucursal y período en la base de datos. Se rechazan IDs de turno de otra sucursal como NOT_FOUND y permisos insuficientes como 403.

### Interpretación de `fuente` para MovimientoCaja

Si el registro tiene relación física con `Pago`, `ReembolsoPago`, `GastoOperativo`, `PagoProveedor` o `LiquidacionRepartidor`, la evidencia devuelve `fuente.tipo`, `fuente.id`, `fuente.tabla` y sus campos relevantes. Si **no tiene ninguna**, `tipo=MANUAL` y referencia al propio MovimientoCaja, con actor, motivo, fecha e importe: no se inventa comprobante de venta.

Ejemplo de estructura (campos reales, valores ilustrativos): 

```json
{
 "movimientoId":"MOV_123","turnoId":"TURNO_2",
 "fecha":"2026-10-30T16:00:00Z","tipo":"INGRESO",
 "monto":"22.00","motivo":"Cobro","registradoPor":{"id":"U1","nombre":"Cajero"},
 "fuente":{"tipo":"PAGO","id":"PAGO_1","tabla":"Pago",
  "cuentaId":"CTA_1","ordenId":"ORD_1","numeroOrden":"ORD-101",
  "metodo":"EFECTIVO","importeDocumento":"22.00"},
 "referenciaIds":{"pagoId":"PAGO_1","reembolsoId":null,"gastoId":null,
  "pagoProveedorId":null,"liquidacionRepartidorId":null}
}
```

## Excel REP-2 (pendiente, exigencia innegociable)

- **Los archivos nunca se generarán solo desde la respuesta agregada del chart.** Usarán estos mismos puertos/consultas de evidencia, con paginación/lectura consistente para períodos grandes.
- Libro de caja con hojas `Resumen`, `Turnos`, `MovimientosCaja`, `Pagos`, `Reembolsos`, `Gastos`, `Liquidaciones`, `Metadatos`; importes como celdas numéricas reales, tablas Excel filtrables y fórmulas `SUMIFS`, `COUNTIFS`, conciliación entre fuentes **sin sumar dos veces** un pago y su MovimientoCaja.
- `Metadatos`: sucursal(es), fecha operativa, hora de corte, zona, instante exacto de captura, usuario solicitante, versión de métrica/fuente, filtros y conteo de filas. Exportar todas las filas autorizadas o fallar explícitamente si se supera el límite; nunca truncar en silencio.
- Importes y encabezados calculables; encabezados, nombres y referencias de usuarios se **escapan** para evitar formula injection en CSV/XLSX.
- En reportes cerrados, una exportación debe usar **un mismo snapshot** de PostgreSQL para resumidos y detalles, evitando divergencias durante exportaciones.
- Prueba de conformidad: suma numérica de filas `MovimientosCaja[Importe]` filtradas `INGRESO` debe igualar el total de ingresos del turno para el mismo snapshot; diferencias reales y movimientos manuales quedan identificados.
- Se necesita un procedimiento de exportación que no exija copiar manualmente IDs ni usar SQL en la UI.

## Gate pendiente de aceptación

1. Validar nuevo GET evidence de un turno conocido con movimientos en DEV: IDs y valores suman Q66 según el caso reportado por usuario, confirmar si los tres son Pago o existe algún movimiento MANUAL.
2. Validar `GET payments/records` y `expenses/records` para el período, con totales del overview, sin cambios concurrentes en DEV.
3. Validar aislamiento 403/404 con credenciales reales por sucursal.
4. Continuar con evidencias de ventas, inventario, proveedores, delivery y reservas; luego implementar XLSX/CSV/PDF y recálculo.
5. No declarar implementado Excel ni hacer merge hasta cobertura REP-1 y REP-2.
