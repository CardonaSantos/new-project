# GASTRO CORE — DEL-A / D3 FINANZAS Y LIQUIDACIONES — PRE-DEV

**Fecha:** 2026-10-29. **Rama de trabajo:** `feat/del-a-customers-delivery`.
**PR:** https://github.com/CardonaSantos/new-project/pull/14 — mantener DRAFT.
**Issue:** https://github.com/CardonaSantos/new-project/issues/13.
**Base principal:** `main@36935d3a28758e46c672f49257de99c752a00db6` (FIN-A fusionado); D1/D2 están en rama DEL-A, no en main.

## Alcance desarrollado D3
- Separación hexagonal: DeliverySettlementsPort/Service/Controller, adaptador DeliverySettlementsStore y dos adaptadores `CourierSettlementsStore` / `PlatformSettlementsStore`, más `SettlementCommon` (SERIALIZABLE, idempotencia, RBAC, audit, outbox), policy y pruebas.
- **PAY-A ownership:** `DeliveryPaymentsPort` y `DeliveryPaymentsStore` en PaymentsModule: reconoce Pago de efectivo de calle con `recibidoPorRepartidor=true`, sin turno ni MovimientoCaja y actualiza Cuenta.pagado; reconoce Pago bruto de plataforma una sola vez, sin turno ni ingreso bancario de gross. No se crea Pago desde la infraestructura DEL-A.
- **FIN-A ownership:** `PlatformLedgerPort` / `PlatformLedgerStore`, que delega en `postVerifiedExternalMovement` para **un único asiento bancario neto**. `FinancialSource` incluye `LIQUIDACION_CANAL`, protegida con índice único parcial.
- Courier: pendientes por sucursal/repartidor, crear LiquidacionRepartidor ABIERTA con líneas por Pago elegible (unique pagoId), cerrar solo con importe exacto/turno abierto actual, insertar **un MovimientoCaja** con `liquidacionRepartidorId` único; registrar discrepancia con motivo sin crear ingreso ficticio ni introducir una autorización extra.
- Plataforma: CanalExterno global con alta autorizada en sucursal, liquidación vinculada a sucursal, linea por Entrega única, periodo local de entrega, bruto/comisión/neto usando Decimal, cuenta financiera activa/misma sede/moneda, referencia bancaria única por sede y canal. La aplicación cuenta el bruto como Pago en PAY-A y neto en ledger FIN-A, sin caja.
- Endurecimiento: DeliveryStore impide reasignar cuando existe efectivo de courier cobrado y cancelar entrega con pagos asociados; PAY-A impide refund courier antes de cash handover y refund de plataforma sin reversa conciliada. Audit/outbox no exponen domicilio/contactos ni motivo libre en outbox.
- Migración única D3: `prisma/migrations/20261029231500_del_a_d3_platform_scope/migration.sql`. Añade sucursalId **nullable** en liquidación de canal con backfill para legados no ambiguos, FK/índice, índice único parcial del asiento LIQUIDACION_CANAL y referencia bancaria. No borrar registros o reescribir saldos anteriores.
- Seed D3: `delivery.payments.collect`, `delivery.settlements.read`, `delivery.settlements.manage`, `delivery.platform.manage`; SUPER_ADMIN recibe por seed. El resto de roles se configuran con Users RBAC.
- DTO HTTP y Vitest unit+HTTP. Colección Postman DEV `docs/del-a/Gastro_Core_DEL_A_D3_Settlements.postman_collection.json`, 30 solicitudes con guía `D3_POSTMAN_DEV.md`.

## Contratos nuevos
- POST `/api/deliveries/:id/collect-cash`
- GET `/api/deliveries/settlements/couriers/pending?sucursalId=&repartidorId=`
- POST `/api/deliveries/settlements/couriers`
- POST `/api/deliveries/settlements/couriers/:id/close`
- POST `/api/deliveries/settlements/couriers/:id/discrepancy`
- GET `/api/deliveries/settlements/couriers/:id`
- GET/POST `/api/deliveries/settlements/platforms/channels`
- POST `/api/deliveries/settlements/platforms`
- GET `/api/deliveries/settlements/platforms/:id`

## Estado verificado y siguiente paso
- D1 Customers + ORD-A, D2 Delivery: usuario ejecutó suites DEV previamente. Fix D2 teléfono tras editar destino está en rama; reporte de los últimos commits en PR.
- **D3 implementado en rama, CI de código `ece58554` SUCCESS**: https://github.com/CardonaSantos/new-project/actions/runs/40970755356 — 199 unitarias, 75 HTTP, PostgreSQL migration-smoke incluido SQL de unicidad bancaria. La compilación y Prisma validate también aprobaron. No afirmar probado DEV hasta recibir las 30 respuestas Postman. `main` permanece intacto.
- D4 después: hardening de reversas de plataforma/reembolsos extraordinarios, cierres PAY-A/FIN-A, rol restringido y multisucursal, y autorización expresa del merge PR #14. No iniciar RSV/QR/REP/FEL/hardware/Angular dentro de DEL-A.
- No inventar monetización: el operador confirma bancarización manual con referencia, conciliación posterior aún de FIN-A.

## Comandos PowerShell (para usuario, DEV)
```powershell
git status
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
# Esta fase sí trae UNA migración y seed nuevos, solo en PostgreSQL DEV con respaldo
npm run prisma:status
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

## Nota final de endurecimiento antes de DEV
- Índices PostgreSQL D3 para pagos de courier y liquidaciones por sucursal/repartidor.
- CI ejecuta `prisma/ci/del-a-d3-ledger-integrity.sql` con rollback; confirma referencia bancaria única y asiento `LIQUIDACION_CANAL` único.
- Reintento del cierre de courier devuelve el mismo resultado aunque el turno original ya se haya cerrado (permisos vigentes revalidados, sin segundo ingreso de caja).
- Faltantes: `POST /api/deliveries/settlements/couriers/:id/discrepancy` registra motivo auditado, mantiene ABIERTA y no crea dinero. Motivos libres se excluyen del outbox.
- Reembolsos de plataforma con asiento neto previamente registrado requieren diseño de reversa controlada FIN-A, a validar en D4; por ahora bloqueados, no burlar por SQL.
