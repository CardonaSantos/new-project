# SUP-A — Abastecimiento interno (macroflujo 20)
**Estado:** SUP-A fusionado desde PR #9. Refactor hexagonal de mantenimiento sobre la rama FIN-A; no cambia reglas ni rutas.
## Principio de UX
- **Solicitar → Enviar → Recibir**, sin autorización administrativa por cada movimiento.
- **Traslado inmediato**: `POST /transfers/immediate` mueve directamente de almacén a almacén en una sola transacción, sin requisición previa; también se admite `inmediato:true` en un envío ligado a requisición.
- En transporte real: el botón Enviar produce salida e `EN_TRANSITO` interno; Recibir produce la entrada.
- Cantidades parciales se registran sin forzar ingreso ficticio de mercancía faltante.
- **Solo una confirmación por decisión real.** Auditoría, Kardex, costes FIFO/promedio e idempotencia son automáticos.
## HTTP
Prefijo `/api/supply`; token JWT y permisos por sucursal.
| Operación | Ruta | Permiso |
|---|---|---|
| Crear requisición | POST /requisitions | supply.request en destino |
| Listar | GET /requisitions?sucursalId=... | supply.read |
| Detalle | GET /requisitions/:id | supply.read destino |
| Stock sugerido | GET /requisitions/:id/availability?almacenOrigenId=... | supply.read en ambas sucursales |
| Crear borrador de orden a proveedor | POST /requisitions/:id/purchase-draft | supply.request destino + purchases.orders.create sucursal |
| Enviar / entrega inmediata | POST /requisitions/:id/send | supply.send origen; supply.receive destino para inmediato |
| Cancelar pendiente | POST /requisitions/:id/cancel | supply.cancel destino |
| Traslado sin requisición (una acción) | POST /transfers/immediate | supply.send origen + supply.receive destino |
| Detalle envío | GET /transfers/:id | supply.read destino |
| Recepción parcial | POST /transfers/:id/receive | supply.receive destino |
## Peticiones ejemplo
Solicitar:
```json
{"claveOperacion":"SUP:REQ:2026:001","almacenDestinoId":"DESTINO","nota":"Reposición semanal",
 "lineas":[{"articuloId":"ARTICULO","cantidadSolicitada":"20"}]}
```
Enviar:
```json
{"claveOperacion":"SUP:SEND:2026:001","almacenOrigenId":"ORIGEN","inmediato":false,
 "lineas":[{"articuloId":"ARTICULO","ubicacionOrigenId":"UBICACION_ORIGEN",
 "ubicacionDestinoId":"UBICACION_DESTINO","cantidad":"20"}]}
```
Recibir parcialmente:
```json
{"claveOperacion":"SUP:RECEIVE:2026:001","observaciones":"Recibimos 18; quedan dos en tránsito",
 "lineas":[{"transferenciaLineaId":"LINEA_ENVIO","cantidadRecibida":"18"}]}
```
Después, otra recepción por 2 completa automáticamente el envío y la requisición.
## Reglas e integración
- `Requisicion`, `RequisicionLinea`, `TransferenciaInventario` y `TransferenciaInventarioLinea` ya estaban en Prisma; no se duplica el motor.
- Una requisición abierta puede tener varios envíos y recepciones. Las unidades recibidas solo se acreditan a `cantidadAtendida` tras postear IN a INV-B.
- Se valida `enviado pendiente + atendido <= solicitado` al enviar, bajo transacción SERIALIZABLE.
- La disponibilidad es sugerida, no reserva física. Enviar valida stock actual y lotes.
- **Unidades comprometidas por compras:** los envíos descuentan también el saldo todavía no recibido en la bodega destino de las órdenes de compra vinculadas que estén en `BORRADOR` o `CONFIRMADA`. Así una misma requisición no puede quedar duplicada entre compras y traslado interno. Las órdenes canceladas o cerradas no comprometen nuevas unidades; las recepciones ya contabilizadas en destino no se descuentan otra vez.
- `GET /requisitions/:id/availability` mantiene `pendiente` (unidades físicas aún no cubiertas por recepciones ni tránsito) y añade `comprometidoCompra` y `pendienteNoComprometido`. `sugeridoEnviar` y `faltante` se calculan sobre el **pendiente no comprometido**; por tanto una compra aún no recibida puede dejar `pendiente>0` con `sugeridoEnviar=0`.
- Los envíos SUP-A no pueden despacharse ni recibirse desde el controlador genérico INV-B para evitar doble posteo.
- Cancelar está prohibido mientras hay unidades en tránsito; las recepciones parciales quedan auditadas.
- Sólo transferencias SUP-A pendientes pasan por `/supply/transfers/:id/receive`. Los traslados inmediatos ya se consideran recibidos y no requieren una segunda acción.
- PUR-A es propietario de órdenes a proveedores. `POST /requisitions/:id/purchase-draft` recibe `{claveOperacion,orden:{proveedorId,sucursalId,precioIncluyeImpuesto,lineas:[...]}}` y **crea** una orden PUR-A en BORRADOR con `requisicionId` y clave idempotente. Exige que las cantidades no superen el faltante no comprometido (descuenta pendientes de transferencia y órdenes de compra activas); un usuario debe confirmarla después desde PUR-A con el permiso correspondiente.
- PUR-A acredita las unidades aceptadas a `cantidadAtendida` solo cuando la recepción confirmada ingresa a la bodega destino de la requisición; no se marcan como atendidas compras recibidas en bodegas distintas.
- La migración `20261028192500_sup_a_purchase_requisition_link` añade únicamente un FK opcional en `OrdenCompra` y un índice. Las OC históricas siguen sin vinculación.
- La versión inicial no resuelve pérdidas definitivas en tránsito. El pendiente permanece hasta un flujo de conciliación administrativa posterior; nunca se destruye valor contable silenciosamente.
## Validación
```sh
npm run prisma:validate
npm run build
npm test
npm run test:e2e
npm run prisma:deploy
npm run prisma:seed
```
Requisiciones y transferencias ya existían; la integración con PUR-A incorpora una migración aditiva para vincular borradores de OC. Ejecutar `npm run prisma:deploy` sobre la base correcta después de respaldo y luego `npm run prisma:seed` para permisos SUP-A.


## Arquitectura hexagonal
- `domain/`: políticas puras de estado visible.
- `application/contracts/` y `application/ports/`: contratos de comando y persistencia desacoplados de Nest/Prisma.
- `application/supply.service.ts`: entrada de casos de uso, utilizada por controladores.
- `infrastructure/prisma/supply.store.ts`: lógica transaccional **existente** preservada de INV-B/PUR-A, idempotencia y auditoría.
- `presentation/http/`: controladores y DTOs validados. Los controladores no usan Prisma.
- `supply.module.ts`: inyección por puerto con `useExisting`.

No se modificaron los flujos ya probados de requisición, OC, envío, recepción o traslado inmediato.
