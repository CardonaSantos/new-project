# DEL-A D4 — Validación integral y cierre del módulo (solo PostgreSQL DEV)

## Alcance y propósito
D4 no reimplementa PAY-A ni ORD-A. Corrige sus transiciones cruzadas:
- `POST /api/orders/:id/close` **no** cierra una orden modalidad DELIVERY hasta que `Entrega.estado=ENTREGADA`, aunque el pago ya esté registrado.
- `GET /api/deliveries/:id/closure-readiness` devuelve `canFinalize`, `alreadyClosed` y códigos de bloqueo: `DELIVERY_NOT_COMPLETED`, `LINES_NOT_SENT`, `KITCHEN_PENDING`, `ACCOUNTS_UNPAID`, entre otros.
- `POST /api/deliveries/:id/finalize-order` es una acción directa (sin segunda aprobación) para gestión; **delegada a PAY-A** mediante la misma transacción serializable de `settle` que genera Venta y cierra Cuenta/Orden. Reintentos secuenciales no crean otra venta.
- Al cancelar una Orden antes de iniciar despacho, una Entrega PENDIENTE se cancela atómicamente, con historial. Con Entrega EN_REPARTO hay que cancelar primero el envío; con Entrega ENTREGADA no se cancela una orden como si nunca hubiera sido entregada.
- El cierre de la orden y la entrega de efectivo del courier son hechos distintos. La Venta puede estar cerrada aunque el efectivo siga pendiente de liquidación; no falsear el `MovimientoCaja`. La liquidación cierra cuando se entrega físicamente el dinero.
- Las órdenes de D3 creadas con `enviarCocina:false` permanecen ABIERTAS aunque estén ENTREGADA y la cuenta pagada, hasta completar preparación/expedición. **No modificar la base de datos manualmente para forzar cierre.**

## Ejecutar los 27 casos de Postman
Importar `docs/del-a/Gastro_Core_DEL_A_D4_Closure.postman_collection.json`.

Variables:
- `baseUrl`: http://localhost:3000
- `token`: token vigente del administrador DEV (no compartir).
- `sucursalId`: ID de sucursal DEV.
- `courierId`: `Usuario.id` del administrador DEV/repartidor activo.
- `varianteId`: variante PREPARADO con **precio unitario Q22.00** en DEV y receta publicada.
- `turnoCajaId`: turno abierto del día operativo vigente y de la misma sucursal.
- `historicDeliveryId`: ID de una entrega terminada en D3 cuya orden no envió cocina; ejemplo del ensayo DEV proporcionado por el usuario: `cmvv3ns44000qfov4em3exkfg`. Solo **datos de prueba**.
- `runId`: vacío para ejecutar una nueva batería de prueba. Otros IDs se guardan automáticamente.

**Prerequisito crítico del paso 06:** variante PREPARADO debe tener una ruta de preparación activa en la sucursal. El paso 02 consulta `GET /api/kitchen/routes?sucursalId=...`. Si falta, crear una estación en `POST /api/kitchen/stations` con `{ "sucursalId":"...", "nombre":"Cocina D4 DEV" }` y luego ruta `POST /api/kitchen/routes` con `{ "estacionId":"...", "varianteId":"..." }`. Hacerlo solo en DEV y una vez; si ya hay ruta, reutilizarla. Debe existir receta publicada y stock válido para enviar a preparar. Si la sucursal tiene configuración `exigeCobroAntesPreparar`, el envío a cocina requerirá su flujo de cobro previo; **no desactivar reglas de producción solo para pasar el ensayo**.

Orden de las solicitudes:
1. 00–01: confirmar que la entrega histórica D3 que no fue enviada a cocina devuelve `LINES_NOT_SENT` y cierre rechazado con 409.
2. 02–08: crear nueva orden, asignar delivery directamente, enviar cocina y marcar comanda `LISTA`.
3. 09–13: despachar, cobrar Q22 contra entrega; confirmar que la Orden no se puede cerrar mientras sigue EN_REPARTO, luego completar Entrega y consultar readiness.
4. 14–17: finalizar la Orden por PAY-A, repetir la misma acción sin Venta duplicada, confirmar Orden y Cuenta CERRADAS y Venta interna existente.
5. 18–20: liquidar Q22 del repartidor en un solo MovimientoCaja y comprobar mismo ID en replay. Hace falta turno actual y `cash.manage`.
6. 21–26: intentar cancelar orden ya cerrada (409), crear una segunda orden/entrega pendiente, cancelar Orden antes del reparto y verificar que Entrega también está CANCELADA con evento trazable.

**Resultados esperados:** 200 para GET, 201 para POST válidos y 409 para rechazos de negocio. No cambiar estados manualmente en Prisma Studio. Si el paso 06 falla por rutas, receta, stock o corte, resolver esas precondiciones y reintentar con la misma clave según corresponda; no forzar la creación de comandas manualmente.

## Comandos PowerShell
```powershell
git status
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
npm run build
npm run start:dev
```
**D4 no requiere migración ni seed adicionales.** D1–D3 ya se aplicaron en DEV. No ejecutar reset/db push.

## Criterios de salida y limitaciones
- CI `verify` y `migration-smoke` verde, incluyendo pruebas de regresión de readiness, idempotencia y trazabilidad. Confirmar CI del HEAD antes del merge.
- Postman D4 coherente, sin doble Venta, Pago, MovimientoCaja o asiento bancario.
- Permisos `delivery.manage` y `orders.manage` se comprueban automáticamente al cerrar; no hay segundo autorizante. Repartidor propio puede entregar, pero no finalizar ventas sin permisos de gestión.
- Roles restringidos y aislamiento de otra sucursal: cubiertos por controles DB/Prisma y tests unitarios donde sea posible, pero **no declarar DEV multisucursal validado** con un único usuario/sucursal real.
- Reembolsos de plataforma externa y reversa bancaria real: explícitamente bloqueados por PAY-A mientras no exista confirmación documental del canal bancario; no realizar reversas automáticas sin esa evidencia. Tratarlos como proceso excepcional controlado/futuro requisito, no afirmar que se han probado end-to-end.
- Las autorizaciones no deben convertirse en pasos adicionales de aprobación para asignar repartidores.
- PR #14 debe permanecer en DRAFT. El merge a `main` requiere autorización expresa del usuario.

## Entrega de evidencias
Compartir únicamente los resultados 00–26 (JSON y status; sin JWT ni datos de clientes reales). Se documentarán en issue #13 y PR #14; preparar checkpoint final de DEL-A y luego planificar RSV-A.
