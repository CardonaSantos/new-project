# DEL-A D2 — DeliveryModule | decisión operativa y contratos

**Decisión del usuario (2026-10-29):** la asignación de un repartidor es **directa e inmediata**, sin flujo de solicitud de aprobación ni segundo usuario autorizante. La seguridad RBAC se ejecuta de forma transparente al guardar la operación. Cancelar exige motivo y rol de gestión, pero tampoco segunda aprobación.

## Flujo
1. ORD-A crea una orden con `modalidad=DELIVERY`. La entrega se registra con destino de texto o dirección activa perteneciente al cliente de esa orden; el texto/referencia/teléfono se guardan como **snapshot**, para proteger el histórico ante cambios del perfil.
2. D2 permite indicar `repartidorId` desde la creación (alta+asignación en un solo gesto) o cambiarlo inmediatamente mediante `POST /api/deliveries/:id/assign`. Sin aprobación pendiente.
3. Estados: `PENDIENTE → EN_REPARTO → ENTREGADA`. También `PENDIENTE/EN_REPARTO → CANCELADA` únicamente con motivo de cancelación; entregada y cancelada son finales.
4. Encargado `delivery.manage` asigna, cambia destino antes de salida, despacha, entrega, cancela; repartidor con `delivery.courier` puede ver sus entregas asignadas y avanzar **solamente las suyas**.
5. El asignado debe ser usuario activo con rol activo (GLOBAL o en sucursal), habilitado por `delivery.courier` o `delivery.manage`. Esto es validación automática de pertenencia, **no una aprobación**.

## Contratos D2
- `GET /api/deliveries?sucursalId=&estado=&repartidorId=&page=&limit=` — `delivery.read/manage` listado de sucursal; `delivery.courier` solo asignadas a sí mismo.
- `GET /api/deliveries/:id`, `GET /api/deliveries/:id/events` — controles por sucursal/recurso; sin filtración de PII entre sucursales.
- `POST /api/deliveries` — `delivery.manage`, `ordenId`, `claveOperacion`, `direccionId` o `direccionTexto`, `repartidorId?`; solo orden DELIVERY no cancelada, una Entrega por orden.
- `PATCH /api/deliveries/:id/destination` — `delivery.manage`, solo PENDIENTE.
- `POST /api/deliveries/:id/assign` — `delivery.manage`, asignación inmediata; mientras no esté ENTREGADA/CANCELADA.
- `POST /api/deliveries/:id/dispatch` — `delivery.manage` o repartidor asignado `delivery.courier`.
- `POST /api/deliveries/:id/complete` — idem; nunca registra ni liquida cobro.
- `POST /api/deliveries/:id/cancel` — `delivery.manage`, motivo obligatorio. No cancela Orden ni revierte pagos/inventario.

## Invariantes
- La restricción `Entrega.ordenId @unique` ya existente permanece. Un pedido de otra modalidad no genera entrega.
- Un solo commit transaccional SERIALIZABLE por cambio: idempotencia, `EntregaEvento`, `EventoAuditoria` y `EventoOutbox` con cambios de estado o asignación. Las auditorías **no guardan dirección, teléfono ni información sensible**.
- Campos `costoEnvio` y `cobrableContraEntrega` quedan en 0 en D2; solo D3 autorizará cobro/conciliación con PAY-A y FIN-A. Nada de MovimientoCaja o doble ingreso.
- Migración aditiva **solo** para eventos de entrega; seed añade `delivery.read` y `delivery.courier`. `delivery.manage` ya existe.
- No se agrega un rol `PENDIENTE_AUTORIZACION`, una bandeja de aprobaciones, ni pasos extra al operador.
- CI antes de Postman DEV y PR #14 en borrador hasta autorización de merge.
