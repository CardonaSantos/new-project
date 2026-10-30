# GASTRO CORE — DEL-A / D4 — QA Y CIERRE TÉCNICO (PRE-DEV)

**Fecha:** 2026-10-30, Guatemala.
**Rama:** `feat/del-a-customers-delivery`
**PR:** https://github.com/CardonaSantos/new-project/pull/14 (DRAFT, **NO MERGE**)
**Issue:** https://github.com/CardonaSantos/new-project/issues/13
**Main:** `36935d3a28758e46c672f49257de99c752a00db6` (FIN-A, sin DEL-A).

## Estado anterior comprobado
D1 Customers/ORD-A y D2 Delivery: DEV funcional probado anteriormente; fix D2 PATCH destination conserva teléfono omitido, retest específico pendiente.
D3: DEV Postman 30/30 respuestas con resultados esperados (2026-10-30). Incluye Pago courier Q22 sin turno, liquidación/MovimientoCaja único Q22, plataforma bruto Q22 comisión Q2 neto Q20 FIN-A, replays idénticos, 409 esperados, no se duplica Pago bruto ni ingreso bancario. Las órdenes sintéticas D3 permanecieron ABIERTA porque `enviarCocina:false`; no es una venta cerrada.

## Ajustes entregados en D4
1. PAY-A `PaymentsStore.settleTx` y `readyToSettle` **verifican Entrega.estado ENTREGADA** antes de contabilizar Venta/cerrar Orden modalidad DELIVERY. Prohíbe bypass desde `POST /api/orders/:id/close`, `/api/accounts/order/:id/finalize` y auto-cierre al cobrar.
2. `GET /api/deliveries/:id/closure-readiness`: muestra `canFinalize`, `alreadyClosed` y blockers. Solo `delivery.manage` en sucursal; no exponer balances o readiness financiera a repartidor sin gestión. Bloqueos: `ORDER_NOT_OPEN`, `DELIVERY_NOT_COMPLETED`, `NO_ORDER_LINES`, `LINES_NOT_SENT`, `KITCHEN_PENDING`, `NO_ACCOUNTS`, `ACCOUNTS_UNPAID`.
3. `POST /api/deliveries/:id/finalize-order`: acción directa sin autorización secundaria, delega exclusivamente a `PaymentsService.settle` con permisos `orders.manage`, bajo transacción SERIALIZABLE de PAY-A. Produce una Venta interna por Cuenta (FK única), cierra Cuenta/Orden; segundo intento devuelve `alreadyClosed=true`, sin nuevas Ventas.
4. ORD-A cancelación: Entrega `PENDIENTE` se cancela junto con Orden en la misma transacción, crea `EntregaEvento` y outbox sin datos de contacto. Si `EN_REPARTO`, exigir cancelar primero la entrega (evita pedidos anulados con courier en calle); si `ENTREGADA`, bloquear cancelación como no entregada y dirigir a devolución. PAY-A no cancela Orden con cuentas ya pagadas, mantiene reglas existentes.
5. Se conserva separación entre reconocimiento de Venta y custodia/entrega de efectivo del repartidor. `ENTREGADA` no implica cierre si cocina no ha terminado o no se pagó. El cierre de Orden puede ocurrir antes de que el courier liquide físicamente el efectivo, porque PAY-A registró su cobro como deuda de custodia; el cierre de liquidación genera MovimientoCaja, nunca otro Pago.
6. CI incluye `prisma/ci/del-a-d4-integrity.sql` que comprueba índices únicos de Venta por Cuenta, Entrega por Orden, Linea de liquidación por Pago y MovimientoCaja por liquidación; preserva D1/D3 PostgreSQL smoke y ensayos existentes.
7. Tests D4 unitarios de readiness (incluido cierre repetido y protección de permiso financiero) y contratos HTTP de los endpoints añadidos. Postman DEV de **27 solicitudes**: `docs/del-a/Gastro_Core_DEL_A_D4_Closure.postman_collection.json`; guía detallada `docs/del-a/D4_CLOSURE_DEV.md`.

## Riesgos y límites explícitos
- No existe evidencia de validación DEV con segundo usuario limitado ni otra sucursal real. Los permisos se revalidan por DB; el QA de esas combinaciones queda como cobertura pendiente, **no fingir certificación**.
- Reembolso excepcional de plataforma con transferencias reales y reversa FIN-A: bloqueado deliberadamente en PAY-A hasta definirse/confirmarse evidencia bancaria. Nunca generar reembolsos bancarios ficticios. Se mantiene como requisito excepcional por diseñar antes de ofrecer esa operación a producción.
- DEV puede tener pedidos D3 `ENTREGADA` pero `Orden.ABIERTA` y `Venta=null` (sin cocina). No alterar manualmente estados para convertirlos en ventas. La nueva colección crea un caso desde cocina para cerrar de verdad.
- No se ejecutan migraciones ni seed nuevos D4; mantener las migraciones D1–D3 ya aplicadas en DEV.
- CI no sustituye la validación manual Postman D4; tampoco se debe fusionar PR #14 sin aprobación expresa.

## PowerShell local
```powershell
git status
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
npm run build
npm run start:dev
```

## Cierre final pendiente
1. Confirmar CI HEAD final con verify + migration-smoke verde.
2. Usuario ejecuta Postman D4 00–26 en DEV y comparte estados/respuestas (sin secretos).
3. Si es verde, documentar aceptación de DEL-A y actualizar issue/PR, entonces **solicitar autorización explícita para merge**; no ejecutar merge de forma autónoma.
4. Siguiente módulo tras DEL-A: **RSV-A Reservaciones**, luego QR-A, REP-A.
