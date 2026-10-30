# Gastro Core — checkpoint REP-A · REP-1 primer corte (30/10/2026)

**Rama:** `feat/rep-a-reporting`  
**PR DRAFT:** https://github.com/CardonaSantos/new-project/pull/18  
**Base:** `main` `a276c2da1fe7441cf15a07832ee8494847ee2622` (RSV-A aceptado y fusionado).  
**Último commit de código validado antes de este checkpoint:** `67f437566e02ad903caf21e3aa5e73839c8420f7`.  
**CI de código:** https://github.com/CardonaSantos/new-project/actions/runs/41126924704 — SUCCESS: 240 unitarias, 86 HTTP, Prisma valida/build y PostgreSQL migration-smoke.

## Alcance del producto (congelado antes de desarrollar)

- REP-A: arquitectura **hexagonal**, un núcleo de definiciones/consultas reutilizado por dos submódulos.
- REP-1 Analytics: **dashboard OPERATIVO** casi en tiempo real y **dashboard ANALÍTICO** por día, semana, mes, rango personalizado, multi-sucursal autorizada, filtros; gráficos y drilldown para Angular.
- REP-2 Exports: Excel **XLSX editable con fórmulas de verdad**, CSV, PDF imprimible, hojas detalladas y auditoría; debe cuadrar exactamente con el motor de REP-1.
- **Datos reales exclusivamente** desde Prisma/PostgreSQL. Venta vs Pago vs MovimientoCaja; Compra vs Consumo; margen realizado vs consumo vs pérdida son nociones distintas. No inventar ganancias o costos ausentes; usar `null` acompañado de definición.
- Guatemala, GTQ, America/Guatemala, hora de corte operativa de cada sucursal, default 04:00. Semana lunes–domingo. Periodos auditables y consistentes.

## Entregado en este primer corte

Directorio `src/modules/reports`:
- `domain/report-period.policy.ts` con fechas estrictas, días operativos, lunes/domingo, febrero bisiesto, límites, 366 días máximo y paginación.
- `application/contracts`, `application/ports/reporting.port.ts` abstracto, `application/reporting.service.ts`.
- `infrastructure/prisma/reporting.store.ts` con RBAC `reports.read` por sucursal, consultas de lectura transaccional RepeatableRead, agrupaciones SQL de importes exactos y series por día operativo.
- `presentation/http` DTOs con whitelist y controladores cache `no-store`.
- `ReportsModule` en `AppModule`.
- No requiere nueva migración Prisma ni perm `reports.read`: **ambos ya existían**.

### Endpoints reales de primer corte

1. `GET /api/reports/operational/dashboard?sucursalId=...` — recuentos de órdenes abiertas, comandas pendientes/preparando, mesas ocupadas, entregas en reparto, reservas próximas y turnos de caja sin cerrar.
2. `GET /api/reports/analytics/overview?sucursalId=...&periodo=DIA&fecha=2026-10-30` — resumen financiero y `serieDiaria`: ventas netas, descuento, ventas antes de descuento, cantidad de ventas/cuentas, tickets únicos `COUNT DISTINCT ordenId`, ticket promedio, pagos, reembolsos, cobros netos, gastos registrados, turnos cerrados, diferencia de caja.
3. `GET /api/reports/analytics/tickets?...` — ventas/cuentas con orden, modalidad, origen, empleado y cliente, paginación 1..100; una venta por cuenta, varios cobros posibles.
4. `GET /api/reports/analytics/payments-by-method?...` — cobros y reembolsos por método de pago original; cero explícito cuando no hay registros.
5. `GET /api/reports/analytics/expenses-by-category?...` — gastos por tipo/categoría, importe/contador; no fingir que están pagados.
6. `GET /api/reports/analytics/cash-shifts?...` — paginación de turnos del período con caja/cajero, fondo inicial, esperado, contado, diferencia; movimientos INGRESO/EGRESO **no sumados** como ventas nuevas.

Todos los endpoints `analytics` admiten `periodo=DIA|SEMANA|MES|PERSONALIZADO`, `fecha` o `desde`/`hasta`. El histórico usa el corte local `horaCorteOperativo`, zona horaria y rango UTC [desde, hasta) calculados por `financialBusinessWindow` ya utilizado por FIN-A. Los importes monetarios salen como strings decimales con dos dígitos. El dashboard operativo da lectura en vivo (sin caché).

**No implementado:** márgenes y resultados netos, que se muestran `null` hasta derivar el costo histórico/contabilidad correctamente. No se añadió SQL que altere los datos.

## Pruebas y aceptación

- `npm run build` + Prisma/TS, Vitest unitarios y HTTP: CI **SUCCESS** en commit `67f43756`.
- Tests de fechas día/semana/mes/personalizado y casos frontera; prevención de doble conteo con montos separados, `null` para margen no sustentado, permiso denegado, paginación.
- Tests específicos del desglose de métodos, reembolso, gasto por categoría y arqueo de caja.
- [Colección Postman DEV inicial — 10 requests](https://github.com/CardonaSantos/new-project/blob/feat/rep-a-reporting/docs/rep-a/Gastro_Core_REP_1_INITIAL_DEV.postman_collection.json).
- **DEV Postman con base real PENDIENTE**. No declarar totales aceptados hasta contrastar con registros de Venta/Pago/GastoOperativo/TurnoCaja y evidencia del propietario.
- **Cuidado:** un periodo puede tener más `ticketsDelDia` sumados que `ticketsUnicos` del período si una misma orden produjo ventas cerradas en distintos días. Explicar ambos recuentos en la UI; no forzar coincidencia falsa.

## Riesgos y siguientes iteraciones antes del merge

1. Comprobar ejecución real SQL y agrupaciones de fechas en DEV (incluyendo casos sin ventas).
2. Añadir reportería transversal de productos, variantes, inventario/recetas/consumos/mermas, compras/proveedores, supply, delivery, reservas y auditoría.
3. Cash/fiscal: conciliación y trazabilidad entre movimiento, venta, cobro, pago a proveedor, banco; costos históricos, ajustes y revisiones por centro/sucursal.
4. Gráficos/dashboards Angular necesitan series por canal/método/producto, comparación autorizada entre sucursales y permission segmentation para costos financieros.
5. REP-2 exports real Excel/CSV/PDF con fórmulas compatibles, sanitización de entrada y auditoría/reproducción desde una misma instantánea de datos.
6. Benchmark y endurecimiento PostgreSQL para rangos anuales y múltiples sedes; exports en jobs si se requiere.

**NO fusionar** el PR #18 ni decir REP-A 15/16 hasta las dos fases completas, verificadas con datos reales y aceptadas.
