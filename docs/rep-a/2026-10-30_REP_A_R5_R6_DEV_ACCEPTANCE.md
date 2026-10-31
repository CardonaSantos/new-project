# REP-A R5/R6 — Acta QA DEV consolidada
Fecha: 2026-10-30. Fuente: nueve respuestas JSON aportadas por el usuario desde Postman, sucursal cmv8p4k3x0001u4v4xor2zgqu. Rama feat/rep-a-reporting, PR #18 DRAFT.

## Pruebas recibidas
1. PAYMENT_SALES_RECON, 2026-10-01..30: **12 cuentas**, 8 con venta, **4 sin venta**, 14 pagos, **Q222.00** cobrado, **Q12.00** reembolsos históricos, **Q210.00** neto. 222 - 12 = 210.
2. PAYMENT_SALES_RECON, 30 oct: 4 cuentas, 3 sin venta, 1 con venta, 4 pagos; **Q88.00**, cero reembolsos. Tres cuentas sin venta (ORD-14b72e61-6f3, ORD-994bf299-716, ORD-ce214876-d7c) aportan **Q66.00**; una cuenta con venta (ORD-e0162508-788) aporta Q22.00. Las 3 órdenes sin venta están actualmente ABIERTA, no hay evidencia de cierre ni de venta reconocida. Esto explica Q88 vs Q22 por momento de reconocimiento; no demostrar bug automático.
3. SUPPLIER_BALANCES: 1 factura de **Q22.40**, pagos aplicados **Q17.40**, crédito aplicado **Q5.00**, saldo **Q0.00**, cero saldos negativos.
4. PLATFORM_SETTLEMENTS: 1 liquidación, bruto **Q22.00**, comisión **Q2.00**, neto **Q20.00**, 1 línea de entrega. Cabecera y línea concilian.
5. BANK_MATCH_STATUS: 3 líneas de extracto, **2 conciliadas** y **1 pendiente**, movimiento firmado total **Q3.00** (3 líneas +Q1.00).
6. PAYMENT_SALES_RECON page=1 limit=1: 1 fila, total=12, totalPages=12; mismos totales que solicitud completa.
7. BRANCH_ROLLUP, mes: 1 sucursal GTQ, **8 ventas Q154.00**, **14 pagos Q222.00**, 2 reembolsos Q12.00, 1 liquidación Q20.00 netos con Q2.00 comisión; **cobrado–venta=Q68.00**. Coincide con (3 cuentas Q22 + 1 cuenta Q2 sin venta).
8. BRANCH_ROLLUP, 30 oct: **1 venta Q22.00**, **4 pagos Q88.00**, 0 reembolsos, 1 liquidación bruto Q22.00/fee Q2.00/neto Q20.00; **diferencia Q66.00**, idéntica a tres órdenes abiertas con pago.
9. BRANCH_ROLLUP, sucursal duplicada: HTTP **400**, mensaje 'sucursalIds requiere 1 a 10 IDs únicos' (resultado NEGATIVO esperado).

## Decisión
**R5 y R6: gate de revisión de RESPUESTAS DEV APROBADO para la sucursal principal**, con 9/9 respuestas de estructura/aritmética coherentes, sin datos parcialmente filtrados en la prueba de IDs duplicados. CI final del código antes de acta: HEAD c5fbe1efdda941c4a1cbe05c4f93bbcd2888a1f5 run 41144298175 SUCCESS, incluyendo build, unit/HTTP y SQL R5/R6 ejecutado en PostgreSQL migrado.

## Límites
No se suministraron salidas de assertions Runner ni consulta SQL directa externa. Las pruebas R6 incluyeron 1 sucursal con 1 moneda; falta prueba empírica con 2 sucursales, moneda mixta y denegación de permiso en una de ellas. Pendientes pruebas de volumen/EXPLAIN, proveedor con saldos parciales y banco con varias cuentas.

IMPORTANTE: Cuatro cuentas sin Venta en el rango incluyen tres órdenes completamente cobradas y ABIERTA, más una orden ABIERTA con Q2 abonados. Son diferencias comerciales de estado y tiempo de reconocimiento, **no una pérdida contable probada**. Estado consultado es actual.

La aceptación del gate DEV de R5/R6 permite iniciar REP-2. PR #18 permanece DRAFT. Las limitaciones se mantienen como verificaciones posteriores y no se omiten del acta de aceptación integral.
