# Gastro Core — RSV-A / Checkpoint implementación completa — pre-DEV

**Fecha:** 2026-10-30 (America/Guatemala)
**Rama:** `feat/rsv-a-reservations` (desde main DEL-A merge `24a880c2`)
**PR DRAFT:** https://github.com/CardonaSantos/new-project/pull/16
**Decisión del propietario:** EXCLUIR correo/SMS/notificaciones/reminders. No integrar proveedores, no hacer cron de mensajes. En reservaciones no se crean `RecordatorioReserva` ni `IntentoRecordatorio`.

## Implementación de cuatro etapas

### R1 — Agenda y disponibilidad
- `GET /api/reservations/availability` recibe sucursal, inicio/fin ISO8601 con **zona horaria obligatoria**, cantidad de personas y devuelve salas/mesas/capacidad, razones de no disponibilidad y sugerencias de una mesa suficiente.
- Cálculo de solapamientos matemáticos `inicio < finSolicitado && fin > inicioSolicitado`, considerando PENDIENTE y CONFIRMADA.
- Mesas y salas inactivas excluidas. Ocupación física abierta impide reservar cuando inicio es próximo (30 min). Para fechas posteriores no se asume que una ocupación de hoy persista indefinidamente.
- Transacción SERIALIZABLE con reintentos, bloqueo de filas Mesa ordenadas `FOR UPDATE` antes de revalidar y escribir. ORD-A `findOrOpen` comparte bloqueo y rechaza walk-ins en mesas reservadas durante su franja.

### R2 — Operaciones y consulta enriquecida
- `POST /api/reservations`: visitante sin Cliente obligatorio o `clienteId` ACTIVO vinculado a sucursal; CONFIRMADA por defecto para evitar aprobación redundante; PENDIENTE opcional; mesa elegida o una asignación automática suficiente. `claveOperacion` idempotente.
- `PATCH /api/reservations/:id`: cambia contacto, mesas, horario, personas, notas y cliente con revalidación de disponibilidad/capacidad. Estado final bloquea edición.
- `POST /:id/confirm`, `POST /:id/cancel`, `POST /:id/no-show` con estados y auditoría; no-show válido desde inicio+15min, sin mensajes ni automatización externa.
- `GET /api/reservations`: **paginado y enriquecido**; sucursal, cliente/contactos, salas/mesas, aforo, ocupaciones y órdenes asociadas, más último evento (sin arrastrar todo el historial de cada fila).
- `GET /api/reservations/:id`: **detalle completo** para Angular con nombre del creador, cliente, mesas+sala, capacidad asignada, ocupaciones, órdenes, estado, horario y TODOS los eventos con actor y motivo. No obligar al frontend a hacer múltiples GET por ID.
- Permisos por sucursal: `reservations.manage` ya existente; `reservations.read` incorporado al seed. Operaciones mutantes solo manage.

### R3 — Check-in y ORD-A
- `POST /api/reservations/:id/check-in`: una acción entre 30min antes e inicio+duración, solo CONFIRMADA; bloquea mesas, abre ocupaciones vinculadas a Reserva, registra outbox `TABLE_OCCUPIED` y cambia Reserva a COMPLETADA (estado enum preexistente entendido como asistencia registrada).
- Reintentos check-in no generan otra ocupación.
- ORD-A `POST /api/orders` con modalidad MESA y el mismo `mesaId` reutiliza la `OcupacionMesa` abierta por RSV-A, sin abrir otra.
- El cierre/liberación real de mesa permanece en ORD-A/PAY-A. RSV-A no genera pedido, cobro ni comanda implícitos.

### R4 — Cierre técnico sin notificaciones
- Tests Vitest de política temporal, capacidad, cierre de estados, permisos por sucursal, mesa fuera de sucursal, solapamiento, bloqueo de check-in inválido, check-in idempotente y audit; HTTP DTOs, datos enriquecidos y rechazo de campos/provider inválidos.
- Colección Postman DEV **11 pasos**: `docs/rsv-a/Gastro_Core_RSV_A_DEV.postman_collection.json` con selección de mesa y creación de una orden de prueba reutilizando ocupación.
- Guía DEV: `docs/rsv-a/R1_R4_DEV_GUIDE.md`.
- Sin migración nueva: cinco tablas de RSV-A ya estaban declaradas/migradas en Prisma desde el esquema base. El permiso `reservations.read` nuevo requiere seed para roles específicos; `reservations.manage` ya estaba en el seed.
- Nada de proveedor, email/SMS, recordatorio, intents, envíos ni costo externo.

## Limitaciones explícitas y siguientes pasos

- La aplicación carece de calendario comercial semanal/feriados en Sucursal; **no inventar horarios ni cerrar reservas por horas desconocidas**. Si se requiere parametrizar disponibilidad por jornada se debe acordar un modelo separado.
- No existe benchmark de latencia p95/p99 ni prueba en DB DEV con recepcionistas concurrentes. SERIALIZABLE/locks y CI dan garantías de diseño, pero comprobar con usuarios reales en DEV antes de producción.
- Asignación automática elige una mesa individual suficiente. Reservaciones de varias mesas están soportadas por `mesaIds`, pero el UI debe elegir la combinación; no se optimiza la colocación multi-mesa automáticamente.
- No-show es manual, intencionalmente sin cron de expiración/reminders.
- La UI Angular debe mostrar: calendario/agenda filtrable; mesas con estado+aforo+sala; tarjeta de reserva; detalle con cliente y teléfono, horario local según `sucursal.zonaHoraria`, ocupaciones/órdenes y cronología; crear/editar/confirmar/check-in sin permisos extra. No exigir IDs CUID escritos.
- **NO merge hasta confirmación de CI HEAD y 11 solicitudes Postman DEV revisadas**, más las pruebas aisladas de no-show/cancelación/roles según disponibilidad del entorno.
- Si falta `reservations.read` para roles adicionales, ejecutar `npm run prisma:seed` SOLO contra DB DEV validada. Nunca DB reset.
