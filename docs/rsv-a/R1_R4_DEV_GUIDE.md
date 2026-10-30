# Gastro Core — RSV-A / Guía operacional DEV — SIN notificaciones

**Rama:** `feat/rsv-a-reservations` · **PR:** https://github.com/CardonaSantos/new-project/pull/16 (DRAFT)
**Dependencias existentes:** ORD-A (salas/mesas/ocupaciones/órdenes) y D1 Customers. Prisma ya incluye `Reserva`, `ReservaMesa`, `EventoReserva`, `OcupacionMesa`; **sin nueva migración de RSV-A en esta rama**.
**Política del usuario:** no conectar correo, SMS ni cualquier proveedor externo. No hay cron, plantillas de notificaciones, envío ni colas de mensajes. Las tablas históricas RecordatorioReserva/IntentoRecordatorio quedan inactivas, sin registros creados por RSV-A.

## Modelo operativo: un solo paso en cada acción normal

1. **Crear:** `POST /api/reservations` confirma por defecto la reserva, sin pasar primero por PENDIENTE. Puede proporcionarse `estadoInicial:"PENDIENTE"` cuando el local prefiera confirmación manual opcional. Puede mandarse `mesaIds` de 1–15 mesas; si no se proporciona, el backend selecciona **la mesa de menor capacidad que alcance personas**, siempre libre. Cuando se necesitan varias mesas combinadas, elegirlas explícitamente en UI. No se requiere cliente formal: se puede registrar invitado por `nombreContacto`, manteniendo `clienteId=null`.
2. **Agenda:** `GET /api/reservations/availability?sucursalId=...&inicio=ISO&fin=ISO&personas=N` devuelve lista detallada de mesas con sala, número, capacidad, disponible, motivo (RESERVADA/OCUPADA), y `sugerencias` de mesas individuales suficientes. No se interpretan ocupaciones abiertas de hoy como ocupación eterna de horarios futuros. Para reservas próximas (inicio dentro de 30 min) sí se exige que no exista una ocupación abierta.
3. **Listado enriquecido:** `GET /api/reservations?sucursalId=...&page=1&limit=20&estado=...&search=...&desde=...&hasta=...`. Incluye sucursal, cliente, contacto, cantidad de personas, mesas con sala y capacidad, ocupaciones y órdenes vinculadas y **último evento** para que Angular pueda mostrar tarjetas/filas informativas. `historialCompleto:false` recuerda que la consulta de detalle devuelve toda la cronología. El listado está paginado.
4. **Detalle enriquecido:** `GET /api/reservations/:id` entrega la cronología **completa**, con nombres de actores; sala, mesas, cliente si está asociado, ocupaciones, creador y órdenes vinculadas (id, número, estado, total). **No obliga a Angular a hacer consultas de IDs uno por uno.**
5. **Editar:** `PATCH /api/reservations/:id`, permite modificar contacto, fechas, personas, notas y mesas mientras PENDIENTE/CONFIRMADA, revalidando disponibilidad/capacidad en la misma transacción. `confirm` solo para PENDIENTE.
6. **Llegada:** `POST /api/reservations/:id/check-in` desde 30 min antes del inicio hasta fin; debe estar CONFIRMADA. Abre una ocupación por mesa, asociada a Reserva y auditable, **en una sola llamada**; pasa Reserva a `COMPLETADA` (este enum existente significa que se registró la asistencia/check-in, no que se terminó de comer). El reintento no duplica ocupaciones.
7. **ORD-A:** tras check-in, `POST /api/orders` modalidad MESA y el mismo `mesaId` **reutiliza** `OcupacionMesa.id`. La reserva por sí sola no crea orden ni comanda. Cuando PAY-A termina y libera ocupación, la lista y detalle lo reflejan.
8. **Cancelar/no-show:** cancelar antes de llegada requiere motivo de al menos cinco caracteres; idempotente. `POST /:id/no-show` puede ejecutarse desde 15 min después de inicio. No se envía SMS ni correo. El no-show es **manual y auditable**; no inferir inasistencia del paso del tiempo sin intervención del personal.
9. **Concurrencia:** las mutaciones usan transacciones SERIALIZABLE, reintentos por colisión P2034 y bloqueo `FOR UPDATE` de las filas `Mesa` ordenadas. ORD-A `TableStore.findOrOpen` aplica el mismo bloqueo y rechaza walk-ins durante un intervalo reservado sin check-in, evitando dobles ocupaciones. El rechazo funcional devuelve 409, no un estado silencioso.

## Estados de negocio

`PENDIENTE` (opcional) → `CONFIRMADA` (por defecto) → `COMPLETADA` al check-in.
PENDIENTE/CONFIRMADA → `CANCELADA` con motivo; o → `NO_ASISTIO` después del margen de 15 min.
CANCELADA/NO_ASISTIO/COMPLETADA son finales. No se reabre una reserva completada ni se cancela una mesa ya ocupada.

## Autorización y límites

- `reservations.manage` para crear, modificar, confirmar, cancelar, no-show y check-in.
- `reservations.read` o `reservations.manage` para consultar disponibilidad/listado/detalle. `reservations.read` fue agregado al seed de permisos. El rol actual de administrador ya tenía `reservations.manage`.
- Comprobar sucursal en cada consulta, mesa activa, sala activa, cliente ACTIVO vinculado a sucursal al seleccionarlo. Sin PII en eventos outbox; el detalle incluye contacto para el operador autorizado.
- Rechazar rangos invertidos, anticipación mayor a 366 días y duración menor de 15 min o mayor de 12 horas.
- Falta configurar horarios comerciales de apertura/cierre en el modelo actual de Sucursal. **RSV-A no inventa horas de operación ni bloquea manualmente por calendario semanal**: ese futuro requisito necesita un calendario de apertura/cierres definido por el restaurante, con reglas explícitas.
- No hay métrica p95/p99 de concurrencia bajo carga ni pruebas manuales multiusuario/multisucursal; CI aporta unitarias/HTTP, pero no sustituye ensayos en PostgreSQL DEV ni pruebas de carga.

## Prueba manual Postman en PostgreSQL DEV

Importar `docs/rsv-a/Gastro_Core_RSV_A_DEV.postman_collection.json` (11 solicitudes). Configurar:
- `baseUrl` = `http://localhost:3000`
- `token` = JWT DEV, secreto.
- `sucursalId` = sucursal DEV con `reservations.manage`.
- `varianteId` = variante del catálogo con precio vigente para probar reutilización ORD-A.
- `runId`, `reservationStart`, `reservationEnd`, `tableId`, `reservationId`, `occupancyId`, `orderId` = vacíos. Scripts generan las fechas próximas y eligen una mesa adecuada; guardar fechas en UTC/ISO con zona explícita. **Si una fecha quedó vieja al reintentar, borrar `reservationStart`/`reservationEnd` y usar otro `runId`.**

La colección prueba disponibilidad, creación directa, datos enriquecidos, rechazo 409 por reserva solapada, actualización, check-in, replay, ORD-A reutilizando ocupación, cronología, prohibición de cancelar después de llegada, listado enriquecido.

**Adicionales a comprobar manualmente:** cancelación válida, no-show después de 15 min, permisos con usuario restringido, concurrencia simultánea y mezcla de sucursales; no se ejecutan automáticamente por requerir control del reloj o usuarios adicionales. No tocar DB real de producción.

## Comandos PowerShell
```powershell
git status
git switch feat/rsv-a-reservations
git pull --ff-only origin feat/rsv-a-reservations
npm run build
npm run prisma:status
npm run start:dev
```
No ejecutar `prisma db push` ni reset. `prisma:seed` solo si se necesita registrar `reservations.read` para roles específicos y después de comprobar la conexión a DEV. No ejecutar seed en producción sin revisión.

## Resultado de cierre
Completar pruebas de DEV, registrar capturas/JSON sin JWT ni contactos reales, ajustar el PR y únicamente entonces considerar el merge. **La rama no debe fusionarse a main automáticamente.**
