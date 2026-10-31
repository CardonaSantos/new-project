# Gastro Core — REP-A / REP-1 R5 + R6

**Fecha:** 2026-10-30. **Rama:** `feat/rep-a-reporting`. **PR #18 DRAFT**, sin merge. Ejecutar una única batería Postman para los dos bloques.

## R5: cuatro fuentes financieras, evidencias independientes

Todos los endpoints usan:

```http
GET /api/reports/analytics/sources/:source?sucursalId=<id>&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&page=1&limit=100
```

Requieren `reports.read` y, respectivamente:

| source | Permiso | Cohorte y contrato |
|---|---|---|
| `PAYMENT_SALES_RECON` | `payments.read` | `Pago.cobradoEn` en ventana operativa, una fila por `Cuenta` con pagos del período; cuenta, orden, venta eventual y estado actual; suma `Pago.monto`. `reembolsadoHistorico` es el total de reembolsos hasta AHORA de **esos pagos**, no reembolso ocurrido en el mismo intervalo. Detecta `cuentasSinVenta`; una cuenta cobrada sin `Venta` no es por sí sola un bug de caja. |
| `SUPPLIER_BALANCES` | `purchases.read` | Balance de facturas actualmente `CONFIRMADA` y `confirmadaEn` antes de fin de ventana. Aplicaciones únicas de pagos `CONFIRMADO` por factura con `confirmadoEn` dentro de corte histórico, y de notas de crédito `CONFIRMADA` antes del mismo corte. Saldo = factura total - pagos aplicados - créditos aplicados. Es snapshot **híbrido**: excluye facturas hoy anuladas aun si existieron en otro período; no es reconstrucción contable de asientos de fecha anterior. |
| `PLATFORM_SETTLEMENTS` | `delivery.platform.manage` | Liquidaciones de plataforma creadas durante el período (`creadaEn`). Su `bruto` y `comision` totalizan según encabezado **una vez**, nunca multiplicados por líneas de entrega. Diferencia recibida/no recibida visible vía `recibidaEn`. Monto `neto` documentado no es efectivo confirmado en banco. |
| `BANK_MATCH_STATUS` | `finance.statements.read` | Líneas de extracto con cuenta financiera de sucursal y moneda, fechas **DATE** entre `desde` y `hasta` inclusivo (sin corte horario). `conciliadas` tiene `movimientoFinancieroId`, `pendientes` carece de él. La suma firmada de extracto no debe compararse automáticamente con venta bruta. |

La respuesta de R5 conserva `source`, `sucursal`, `currency`, `periodo`, `generatedAt`, `totales`, `data` y `meta`. `meta.totalPages` se calcula sobre **la cohorte completa** y `totales` es independiente de `page/limit`. Las cantidades de dinero se serializan a 2 decimales. No alterar ni escribir transacciones.

**Precaución:** Estas cuatro fuentes responden a **cuatro momentos distintos**; no restar directamente `PAYMENT_SALES_RECON.cobrado` contra ingresos totales de `Venta` y declarar un descuadre. Venta reconocida en cierre y cobro registrado en pago pueden estar en fechas distintas, especialmente entregas y anticipos.

## R6: consolidado multi-sucursal autorizado

```http
GET /api/reports/analytics/sources/consolidated?sucursalIds=id1,id2&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30
```

- **1 a 10 sucursales únicas**; si hay ID repetido o más de 10, HTTP 400. Cualquier falta de permisos cancela toda la consulta antes de emitir datos; no retorna éxito parcial ni datos de otras sucursales.
- Cada sucursal debe conceder simultáneamente `reports.read`, `sales.read` y `payments.read`, con rol activo GLOBAL o SUCURSAL asignado a ese ID. No se confía en un permiso genérico de una sucursal para leer otras. Búsqueda de permisos integrada al mismo snapshot `REPEATABLE READ`.
- Las ventanas operativas se calculan **independientemente para cada sucursal**, conservando `zonaHoraria` y `corte`. Una consulta PostgreSQL con `VALUES` y agregaciones separadas de `Venta`, `Pago`, `ReembolsoPago` y `LiquidacionCanalExterno` evita multiplicar importes por relaciones N:M o varios pagos de una cuenta dividida.
- `data`: por sucursal `ventas` (conteo `Venta`), `ingresos` (suma `Venta.total` al cierre), `pagos` y `cobrado` (fecha de `Pago.cobradoEn`), `reembolsos` y `reembolsado` (fecha de `ReembolsoPago.creadoEn`), `liquidaciones`, `comisiones`, `netoLiquidado` (**importe documentado de liquidación, no banco**), `diferenciaCobrosVsVentas` (indicador de distintos momentos, no irregularidad automática).
- `totalesPorMoneda` suma **solo sucursales de la misma moneda**. Nunca convierte ni mezcla GTQ con USD; no genera un falso total global entre monedas.
- Máximo 10 sucursales reduce el volumen y el número de comprobaciones RBAC; fuente de una consulta SQL de agregación independiente por rama. Usar índices ya existentes de `Venta(sucursalId,cerradaEn)`, `Pago(cuentaId,cobradoEn)` y `LiquidacionCanalExterno(sucursalId,periodoInicio)` en la lectura. Confirmar plan e índices reales de liquidaciones si la tabla crece.

## Comprobaciones automatizadas

- Unit R5: cobranzas con/sin venta, reembolsos del cohort de pagos, factura menos aplicaciones y créditos sin recortar saldos negativos, comisión de plataforma sin doble conteo, banco de fecha `DATE` e independencia de página.
- Unit R6: partición de moneda, conteo/importe por sucursal, una sola consulta agregadora, rechazo de IDs duplicados/más de 10 y denegación integral si falta `payments.read` en cualquier sucursal.
- GitHub Actions incorpora `prisma/ci/rep-a-r5-r6-query-smoke.ts`, que ejecuta SQL R5+R6 **contra PostgreSQL migrado** para detectar errores de SQL y esquema. Con una cohorte vacía solo verifica estructura, no conciliaciones reales. Se conserva el smoke anterior R4.
- [**Postman DEV conjunto R5+R6 (9 solicitudes)**](Gastro_Core_REP_1_R5_R6_FINANCIAL_MULTIBRANCH_DEV.postman_collection.json) con token y sucursal principal. Solicitudes: R5 pagos mensual, pagos diario, proveedores, plataformas, bancos, paginación; R6 consolidado mensual, consolidado diario y duplicado 400.

## Restricciones y gate local

La batería DEV debe validar importes reales, permisisos negativos y, si existe, al menos una segunda sucursal autorizada para el consolidado R6. La diferencia de cobros/ventas no se debe cerrar como error sin revisar `Orden.estado`, `Cuenta.estado`, `Venta.cerradaEn` y `Pago.cobradoEn`.

Una vez que el **HEAD final** tenga CI `SUCCESS`, el usuario deberá sincronizar local **una sola vez** y ejecutar la colección conjunta. Hasta entonces no solicitar sincronizaciones intermedias. R5 y R6 no agregan migraciones de Prisma ni afectan transacciones de escritura. **REP-2 XLSX/CSV/PDF y aceptación integral aún pendientes**. Sin merge a `main`.
