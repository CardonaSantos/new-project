# Gastro Core — Checkpoint REP-A R5 + R6 conjunto

Fecha: 2026-10-30. Repositorio `CardonaSantos/new-project`; rama `feat/rep-a-reporting`; PR #18 **DRAFT / NO MERGE**.

## Alcance desarrollado en esta tanda

**R5 – finanzas**: cuatro fuentes, implementadas en `src/modules/reports/infrastructure/prisma/financial-reconciliation.ts`:
1. `PAYMENT_SALES_RECON` — cohorte `Pago.cobradoEn`, agrupa por `Cuenta`, enlaza `Orden` y `Venta`, identifica pagos sin venta, cobros y reembolsos históricos de esa cohorte sin multiplicar por líneas.
2. `SUPPLIER_BALANCES` — facturas proveedor confirmadas actualmente y confirmadas antes del fin del período; aplicados pagos confirmados y créditos confirmados hasta ese fin; saldo firmado, `saldoNegativo` si corresponde. Snapshot híbrido de estado actual e hitos históricos, no libro mayor retroactivo puro.
3. `PLATFORM_SETTLEMENTS` — liquidaciones de plataforma registradas en período con bruto, comisiones y neto, sin duplicar importes por cantidad de entregas. Indica `recibidaEn` sin confundir registrado y bancariamente recibido.
4. `BANK_MATCH_STATUS` — extractos bancarios por `DATE` dentro del período inclusivo; conteo de líneas conciliadas/pendientes y movimiento firmado, filtrando cuenta de sucursal + moneda.

**R6 – consolidado multi-sucursal**: `GET /api/reports/analytics/sources/consolidated?sucursalIds=id1,id2&periodo=...`. Entre 1 y 10 sucursales distintas; exige por cada una `reports.read`, `sales.read` y `payments.read` en roles autorizados. Una negación produce 403 para la consulta completa, sin resultados parciales. Cada sucursal calcula su propio corte operativo. Un único SQL con subconsultas agregadas **por separado** para ventas, cobros, reembolsos y liquidaciones impide multiplicidad de importes; `totalesPorMoneda` no mezcla divisas. Contrato `src/modules/reports/infrastructure/prisma/branch-rollup.ts`.

## Integración

- Nuevas fuentes añadidas en `src/modules/reports/application/ports/domain-reports.port.ts`: 11 anteriores + 4 R5 = **15 fuentes HTTP**. Las cuatro heredan `context`, fecha operativa, permisos de sucursal, `REPEATABLE READ`, `limit <= 100`.
- R6 usa `ConsolidatedReportDto` (CSV de IDs validado), servicio/puerto de `DomainReportsService` y ruta estática `'consolidated'` declarada antes de `:source`. No añade nuevas tablas ni muta caja/inventario.
- Tests en `financial-reconciliation.spec.ts`, `branch-rollup.spec.ts`, `domain-reports.store.spec.ts` y `test/domain-reports.e2e-spec.ts`: costos y balances, fechas de extracto, moneda separada, rechazo de IDs duplicados y más de 10, acceso denegado si falta un permiso en alguna sucursal, registro correcto de ruta.
- CI `prisma/ci/rep-a-r5-r6-query-smoke.ts` ejecuta **SQL R5 y R6 en PostgreSQL migrado** con cohorte vacía (verifica sintaxis SQL, join/tipos) y trabajo `migration-smoke` de GitHub Actions. No sustituye DEV con datos reales.
- Documentación `docs/rep-a/REP_1_R5_R6_FINANCIAL_AND_MULTIBRANCH.md`.
- **Única colección Postman** `docs/rep-a/Gastro_Core_REP_1_R5_R6_FINANCIAL_MULTIBRANCH_DEV.postman_collection.json` con **9 solicitudes** R5+R6; incluye día 2026-10-30 para estudiar Q88 cobros vs Q22 ventas registradas, sin asumir pérdida/doble contabilidad; request negativo R6 ID duplicado debe devolver 400.

## Verificaciones pendientes para gate de desarrollo

1. Confirmar CI **del HEAD final** de R5 y R6, incluyendo HTTP test de ruta `consolidated` y Postgres SQL smoke. Resolver cualquier fallo; no tomar un commit parcial verde como suficiente.
2. Única actualización local: `git status`, `git fetch origin`, `git switch feat/rep-a-reporting`, `git pull --ff-only origin feat/rep-a-reporting`, `git log -1 --oneline`; `npm run start:dev` si backend detenido; sin migraciones nuevas.
3. Ejecutar colección Postman **R5+R6** con `token` y `baseUrl`, `sucursalId=cmv8p4k3x0001u4v4xor2zgqu`, `desde=2026-10-01`, `hasta=2026-10-30`, `fecha=2026-10-30`; adjuntar respuestas JSON y resultados de tests.
4. Si hay segunda sucursal, probar dos sucursales autorizadas y caso falta permiso en la segunda; sin eso R6 multi-sucursal solo tiene tests unitarios, SQL CI y DEV una sucursal.
5. Actualizar acta DEV con números reales y distinguir `cobrado`, `Venta.cerradaEn`, `reembolsadoHistorico`, `ReembolsoPago.creadoEn`, `LiquidacionCanalExterno.creadaEn`, `recibidaEn` y `LineaExtractoBancario.fecha`. Los períodos y estados históricos tienen semántica diferente.
6. Gate REP-1 global: confirmación de excepciones de empaque, costos directos, RBAC y comprobación SQL independiente / plan de rendimiento con volumen. R5/R6 aún no aprobados en DEV; REP-2 exportaciones XLSX/CSV/PDF sigue pendiente. No merge sin autorización expresa.

## Histórico anterior

- R3: 22/22 respuestas HTTP de reportes iniciales y transversales recibidas, pero no Postman runner formal ni SQL independiente.
- R4/A: 9 documentos, Q16.928570 costo de preparación, 10 movimientos.
- R4/B: 8 VentaLinea, Q154 ingreso, Q10.799999 costo directo identificado, Q143.200001 margen **antes de empaque**; cuentas divididas sin duplicación.
- R4/C: 8 órdenes, 9 documentos, 6 cerradas Q10.799999 + 2 canceladas Q6.128571. Empaque no registrado (no equivale a costo esperado cero), `limit=1` y globales conciliados en DEV.
