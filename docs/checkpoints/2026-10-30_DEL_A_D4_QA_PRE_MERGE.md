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


## Aceptación funcional D4 en DEV — 2026-10-30

**Evidencia del usuario:** 27 respuestas consecutivas de la colección D4 (00–26), procedentes de su PostgreSQL DEV. Los JSON mostraron los resultados esperados; no se adjuntó informe global de Postman ni prueba paralela de concurrencia real.

- **00–01:** entrega D3 anterior `cmvv3ns44000qfov4em3exkfg` ENTREGADA / Orden ABIERTA, `closure-readiness.blockers=['LINES_NOT_SENT']`; intentar cerrar devuelve 409 esperado.
- **02:** ruta activa de cocina para variante `cmv9wfri60005kov4x7zq4yfz`.
- **03–08:** Orden `cmvv5us2l00014gv40mpyw217`, Entrega `cmvv5v8i100094gv4afr2mdnf`; primero PENDIENTE con blockers entrega/sin cocina/sin pago; después envío a cocina, comanda `cmvv5vq2u000e4gv44elw0rao` PENDIENTE y luego LISTA, `cantidadEnviada=1` y `cantidadPreparada=1`.
- **09–13:** entrega EN_REPARTO, PAY-A reconoce Pago `cmvv5wwka000z4gv46et2hkl3` de Q22 (`turnoId=null`, recibidoPorRepartidor); cierre prematuro de ORD-A rechazado 409, entrega ENTREGADA, `canFinalize=true` sin blockers.
- **14–17:** acción directa de cierre de Orden usando PAY-A; replay devuelve `alreadyClosed=true` sin segundo cierre. Orden y Cuenta `cmvv5us2w00024gv4grrm99wh` CERRADAS; `pagado=22.00`, `saldo=0.00`; Venta `cmvv5y7xe00174gv4k9v72nve` de Q22 con una línea.
- **18–20:** LiquidacionRepartidor `cmvv5zawd001e4gv47fd8x94w` ABIERTA Q22 -> CERRADA Q22 sobre turno `cmvv3hupg0009fov4ji0uaci8`; MovimientoCaja `cmvv5zkzs001j4gv4d8ew3bv9` único y mismo ID en replay.
- **21–26:** cancelación de Orden CERRADA rechazada 409; segunda Orden `cmvv60jaq001n4gv4trspnze2` y Entrega `cmvv60tx9001v4gv4rs646d9d` PENDIENTE se cancelan en conjunto; Cuenta CERRADA y total 0, no recibió efectivo; evento `DELIVERY_CANCELLED_WITH_ORDER` con PENDIENTE -> CANCELADA y motivo auditado.

**Resultado:** D4 funcional aceptado sobre una sucursal DEV con administrador; 27/27 respuestas coherentes, sin fallos de negocio inesperados. La CI anterior del código y documentación fue SUCCESS [41082226523](https://github.com/CardonaSantos/new-project/actions/runs/41082226523) con 207 unitarias y 76 HTTP, más smoke PostgreSQL. No se ha modificado ni fusionado `main`.

### Observación y límites conservados

- La línea de comanda figura `listaEn` y `cantidadPreparada=1`, pero `entregadaEn=null`; la entrega física global sí figura ENTREGADA y PAY-A cierra correctamente. El endpoint de cocina para entrega de línea es una acción separada; **no se probó su registro en D4**. Mantener como mejora de trazabilidad operacional, no afirmar entrega de cada línea comprobada por cocina.
- No se observaron nuevas respuestas de retest manual para el fix D2 de teléfono/referencia omitidos; el fix tiene pruebas automatizadas CI.
- No se probó identidad con solo `delivery.courier`, otra sucursal, ni concurrencia real simultánea sobre DEV. RBAC/aislamiento y unique constraints tuvieron cobertura CI pero no equivalen a pruebas multiusuario reales.
- Reembolsos excepcionales de plataforma con reversa bancaria externa se mantienen bloqueados, **no disponibles para producción** hasta documentación de proceso externo de conciliación.
- D4 no crea ni necesita nuevas migraciones o seed. El merge del PR #14 requiere **consentimiento expreso** posterior a esta revisión.

**Estado de entrega:** D1–D4 desarrolladas; D1–D4 probadas funcionalmente en DEV en los escenarios definidos, PR #14 en DRAFT y pendiente decisión de merge. Después: RSV-A Reservaciones.


## Auditoría de fluidez premerge — 30 octubre 2026

Ante la pregunta explícita del operador sobre procesos lentos o aprobaciones redundantes, se examinó el código real D1–D4 y se identificó un paso manual evitable en **liquidación ordinaria de efectivo**: antes requería `crear liquidación ABIERTA` y `cerrar liquidación` incluso cuando efectivo contado coincidía.

**Corrección de UX en rama, sin nuevas migraciones ni permisos:**
- Se añadió `POST /api/deliveries/settlements/couriers/close-direct`, una única acción de caja que crea la liquidación CERRADA y el único movimiento de caja en **la misma transacción SERIALIZABLE**, con autorización vigente, día operativo válido, efectivo esperado exacto, audit/outbox e idempotencia. Conserva flujo de incidencia existente.
- Code CI [41089286779](https://github.com/CardonaSantos/new-project/actions/runs/41089286779) SUCCESS: **211 unitarias + 77 HTTP**, PostgreSQL migration-smoke SUCCESS. El nuevo atajo incorpora 4 pruebas unitarias y una prueba HTTP; la migración existente no cambió.
- Colección Postman independiente con **9 solicitudes DEV**: `docs/del-a/Gastro_Core_DEL_A_UX_Direct_Cash.postman_collection.json`. **Aún no ejecutada manualmente en DEV** al escribir este checkpoint. No fusionar sin esa evidencia adicional.
- Análisis por rol y acción: `docs/del-a/DEL_A_UX_PREMERGE_AUDIT.md`. No hay doble autorización para asignar repartidor; asignar al crear entrega es directo. Cocina, despacho, entrega física, cobro y recepción del efectivo son eventos auditables, no pasos burocráticos. Los 27/30 requests Postman originales representan QA, no clics del usuario.
- **Punto de implementación Angular:** `GET closure-readiness` debe ser consulta de UI, no botón; el frontend podrá encadenar cierre PAY-A si ya está lista la orden y el actor tiene permisos. Los IDs de datos deben elegirse por select; no pedirlos tecleados.
- **No existe benchmark de latencia ni prueba de carga:** un liquidación de plataforma grande puede recorrer muchos pagos en una transacción. No afirmar que p95/p99 estén certificados. Mantener prueba de rendimiento realista como compuerta anterior a producción, no como autorización añadida al usuario.

**Estado de merge:** PR #14 DRAFT, sin merge. El usuario aprobó el objetivo de fusionar pero pidió una revisión de fluidez **antes**; comprobar la nueva colección DEV y cerrar el punto de auditoría antes de ejecutar merge.
