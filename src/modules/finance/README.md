# FIN-A — Finanzas y cierre operativo (macroflujo 21)

**Estado:** PR de desarrollo inicial. FIN-A no está terminado y no se debe fusionar este PR hasta completar gastos, movimientos y cierre, además de pruebas con PostgreSQL DEV.

## Propiedad e invariantes
- PAY-A sigue siendo dueño de caja, turnos, pagos al cliente, venta interna y reembolsos. No replicar esos movimientos.
- PUR-A sigue siendo dueño de las órdenes, facturas y pagos a proveedores. FIN-A solo debe reconocer movimientos financieros confirmados, nunca crear pagos ficticios.
- FIN-A es dueño de CuentaFinanciera, MovimientoFinanciero, GastoOperativo y CierreOperativo. Los 4 modelos ya existen en Prisma.
- No se confunde el saldo de MovimientoFinanciero con saldo bancario real. Las cuentas operativas se limitan en esta entrega inicial a una sucursal, moneda de configuración y tipos BANCO, TARJETA_EMPRESA, EFECTIVO_EXTERNO.
- Un registro de cuenta NO crea fondos iniciales ni movimientos. Cualquier dinero contabilizado requiere un evento financiero de fuente verificable.
- `horaCorteOperativo` y `zonaHoraria` por sucursal rigen el cierre. No usar UTC civil como fecha operativa sin conversión. Un cierre debe capturar snapshot con historial y prohibir modificaciones retrospectivas sin corrección auditada.
- Dinero decimal exacto, autorización por sucursal real, idempotencia, transacciones serializables, auditoría y outbox.

## FIN-A — fase inicial operativa (este PR parcial)
- `GET /api/finance/accounts?sucursalId=...&page=1&limit=20`: cuentas por sucursal, paginadas, `saldoRegistrado` agregado desde movimientos firmados.
- `POST /api/finance/accounts`: alta idempotente por sucursal (claveOperacion), auditada. Nombre de 2–160 y tipo permitido.
- `GET /api/finance/accounts/:id`: detalle y saldo registrado.
- `GET /api/finance/accounts/:id/movements?page=1&limit=20`: historial registrado sin crear movimientos.
- Permisos `finance.read`, `finance.accounts.manage`, `finance.movements.read`, sincronizables por seed.
- **Sin migración nueva por ahora**: se utilizan tablas existentes y no se alteran datos de negocio.

## Próximos incrementos para completar FIN-A
1. Gastos operativos con idempotencia, adjuntos/referencias, fuentes de fondos validadas y autorización, incluidos egresos de caja mediante el propietario PAY-A; sin dos asientos por el mismo gasto.
2. Movimientos bancarios conciliables vinculados a hechos confirmados (PAY-A/PUR-A), conciliación explícita y reversas auditadas. Definir apertura/fondos y aprobación financiera antes de los write endpoints.
3. Vista previa de cierre por sucursal y fecha operativa, considerando zona horaria/corte; validación de turnos abiertos, pagos pendientes y gastos.
4. Cierre inmutable `CierreOperativo` único por sucursal/día; reporte histórico, idempotencia, pruebas de carreras y conciliación.
5. Validación en PostgreSQL de desarrollo, Postman y CI; entonces solicitar merge.

## Restricciones
No FEL, integración bancaria automática ni dispositivos físicos en FIN-A. Esta fase NO contabiliza gastos/cierres aún. No aplicar migraciones/seed en producción sin verificar DATABASE_URL, respaldo y política de despliegue.
