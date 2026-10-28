# SUP-A — Abastecimiento interno (macroflujo 20)
**Estado:** desarrollo activo en PR #9. No fusionar antes de pruebas reales.
## Principio de UX
- **Solicitar → Enviar → Recibir**, sin autorización administrativa por cada movimiento.
- **Traslado inmediato**: `inmediato:true` envía y recibe en la misma transacción.
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
| Enviar / entrega inmediata | POST /requisitions/:id/send | supply.send origen; supply.receive destino para inmediato |
| Cancelar pendiente | POST /requisitions/:id/cancel | supply.cancel destino |
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
- Los envíos SUP-A no pueden despacharse ni recibirse desde el controlador genérico INV-B para evitar doble posteo.
- Cancelar está prohibido mientras hay unidades en tránsito; las recepciones parciales quedan auditadas.
- Sólo transferencias SUP-A pasan por `/supply/transfers/:id/receive`.
- PUR-A sigue siendo propietario de órdenes a proveedores. La compra de faltantes se integrará en el siguiente corte sin crear órdenes automáticamente en este primer corte.
- La versión inicial no resuelve pérdidas definitivas en tránsito. El pendiente permanece hasta un flujo de conciliación administrativa posterior; nunca se destruye valor contable silenciosamente.
## Validación
```sh
npm run prisma:validate
npm run build
npm test
npm run test:e2e
npm run prisma:seed
```
No se requiere migración en este corte: los documentos de requisición/transferencia ya existían. Ejecutar seed agrega los permisos SUP-A al SUPER_ADMIN.
