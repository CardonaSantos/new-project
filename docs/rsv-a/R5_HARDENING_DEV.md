# RSV-A / Cierre de QA complementario (30/10/2026) — SIN CORREOS NI SMS

**Rama:** `feat/rsv-a-reservations` / **PR #16 DRAFT**, sin merge a main.

La colección inicial de 11 solicitudes fue ejecutada por el usuario en PostgreSQL DEV. Las pruebas 01–10 verifican reserva CONFIRMADA, calendario con bloqueo de solapes, edición/historial, check-in/replay, orden ORD-A asociada a la misma ocupación, cancelación ilegal tras llegada (409) y listado enriquecido. El resultado 00 mostrado fue `RESERVADA` por la misma Reserva creada en 01: pudo deberse a **repetición del GET después de crear**, pero no está probado el orden de ejecución original. El nuevo ensayo empieza con fecha futura distinta y comprueba primero LIBRE → RESERVADA → LIBRE.

## 1. Colección complementaria Postman

Importar `docs/rsv-a/Gastro_Core_RSV_A_Hardening_DEV.postman_collection.json`.

Variables manuales: `baseUrl=http://localhost:3000`, `token` de administrador DEV, `sucursalId` DEV.
Todas las demás **vacías**: `runId`, `suiteStart`, `suiteEnd`, `tableId`, `roomId`, `baseCapacity`, `partyMulti`, `pendingId`, `secondTableId`, `multiId`.

La colección escoge una mesa real disponible **150 minutos después del instante de ejecución**, no la reserva anterior ocupada en el presente. Requiere `reservations.manage` y `tables.manage`, y una sala/mesa activa con capacidad mínima 2. Usa una fecha de inicio y fin ISO UTC con timezone explícita. Si re-ejecutas toda la batería, borra `runId`, `suiteStart` y `suiteEnd` o utiliza un nuevo entorno DEV. Si ya hay otras reservas futuras, elegir otro intervalo libre.

### Pasos y expectativas

| Caso | Operación | Resultado |
| --- | --- | --- |
| 00 | Availability de intervalo fresco, antes de crear | 200, mesa seleccionada libre |
| 01 | Crear reserva PENDIENTE con invitado | 201, PENDIENTE |
| 02 | Revisar disponibilidad tras reservar | 200, mesa RESERVADA, conflicto apunta a ID creado |
| 03–04 | Confirmar y repetir | 201 + 201, solo un evento CONFIRMED |
| 05 | Cancelación con motivo inválido | 400 esperado |
| 06–07 | Cancelar y repetir | 201 + 201, único evento de cancelación |
| 08 | Comprobar disponibilidad tras cancelar | 200, mesa libre |
| 09 | Crear segunda mesa sintética en misma sala (aforo 2) | 201 |
| 10 | Reserva para **más personas que la capacidad de una sola mesa** usando dos mesas | 201 y capacidad combinada suficiente |
| 11–12 | Disponibilidad de ambas y detalle enriquecido | 200, ambas RESERVADA, creador y sala visibles |
| 13 | Intentar otra reserva sobre una de las dos | 409 esperado |
| 14 | Cancelar reserva múltiple | 201 |
| 15 | Desactivar la mesa sintética (sin borrar registros ni mesa real) | 200 |
| 16 | Comprobar mesa base LIBRE y mesa sintética fuera de la agenda | 200 |

**¡Atención!** Si la ejecución se interrumpe después de crear la mesa en el 09, puedes continuar de donde te quedaste. NO repetir todo con las mismas claves esperando que POST /tables sea idempotente: ese endpoint heredado rechaza el mismo número con 409. Si una reserva de pruebas quedó activa, cancelarla por API antes de liberar/inhabilitar la mesa.

La mesa T-01 y su orden previa del ensayo inicial **no se modifican con esta colección**. Sigue existiendo `ORD-f26e4774-ccd` abierta y `OcupacionMesa.id=cmvv9mbyo000c9sv44173m8w6` pendiente; deberás usar ORD-A/PAY-A para cerrarla y liberar mesa si es necesario. No usar SQL ni Prisma Studio para falsear estados.

## 2. Concurrencia real (dos recepcionistas/solicitudes simultáneas)

Script sin paquetes externos: `scripts/rsv-a-concurrency-dev.mjs` (Node 20+). Usa la misma API/DB DEV y efectúa un `Promise.all` de dos solicitudes POST diferentes por la misma mesa/horario. Debe obtener **exactamente un 201 y un 409**, comprobar el ID ganador en disponibilidad y **cancelar automáticamente** la reserva ganadora al finalizar. Nunca usarlo en producción.

PowerShell, después de actualizar la rama y arrancar NestJS:
```powershell
$env:RSV_BASE_URL = "http://localhost:3000"
$env:RSV_TOKEN = Read-Host "JWT de administrador DEV"
$env:RSV_SUCURSAL_ID = "cmv8p4k3x0001u4v4xor2zgqu"
$env:RSV_MESA_ID = "cmvb9at1w0026lov4gvkrlayi"
node .\scripts\rsv-a-concurrency-dev.mjs
```
Este script usa un intervalo **240 min hacia el futuro**; si ya está reservado, aborta sin cambios. No imprime el JWT. El script no sustituye una carga real a cientos de usuarios, pero valida una carrera HTTP contra el PostgreSQL DEV.

## 3. NO_ASISTIO (caso dependiente del tiempo)

El flujo NO_ASISTIO no debe marcarse inmediatamente después de reservar. Para comprobarlo:
1. Crear con `POST /api/reservations` una reserva CONFIRMADA de una mesa disponible, con inicio 1–2 minutos en el futuro y duración de 90 minutos.
2. `POST /api/reservations/:id/no-show` con `{"motivo":"El cliente no se presentó"}` antes de que hayan pasado 15 minutos desde `inicio`: **409 esperado**.
3. Una vez hayan transcurrido 15 minutos desde `inicio`, repetir el mismo POST: **201, estado NO_ASISTIO**, evento `RESERVATION_NO_SHOW` y sin más notificaciones.
4. Repetirlo: **201**, no crea segundo evento; consultar la disponibilidad y verificar que la reserva ya no bloquea. Si una ocupación ya estaba abierta en la mesa por otra operación, esa ocupación permanece bloqueando hasta ser cerrada correctamente.

**Sin atajos temporales:** no modificar la hora del sistema ni fechas de PostgreSQL. La política ya tiene pruebas unitarias con reloj simulado para las fronteras de 15 minutos.

## 4. Permisos y sucursales

`reservations.read`: puede consultar detalle/listado/disponibilidad sin crear, editar ni hacer check-in. `reservations.manage`: puede gestionar solo en sus sucursales autorizadas. Validar manualmente con al menos un segundo usuario/sucursal en DEV cuando existan credenciales; no usar SUPER_ADMIN como si fuera un rol restringido. Los unit tests cubren exclusión de permisos y asignación de mesa de otra sucursal, pero no equivalen a ese escenario de extremo a extremo.

## 5. Datos enriquecidos para Angular

- El API devuelve `faseAtencion`: `EN_MESA` cuando `estado=COMPLETADA` pero la ocupación continúa abierta, o `ATENCION_FINALIZADA` cuando ya fue cerrada, evitando mostrar prematuramente «servicio completado».
- `llegadaRegistrada` y `ocupacionActiva` se derivan de los datos persistidos.
- Los eventos `RESERVATION_UPDATED` incluyen nombres de campos modificados **sin valores sensibles**; el detalle tiene actores e historial completo, el listado paginado solo el último evento.
- No hay correos, SMS, provider, jobs de notificaciones ni cron de no-show.

## 6. Gate antes de merge

1. CI del último HEAD verde en `verify` y `migration-smoke` (las corridas anteriores `9b639bdf` fueron SUCCESS).
2. Revisar respuestas Postman 00–16 y salida del script de concurrencia.
3. Registrar cobertura temporal NO_ASISTIO / permisos (si no se dispone de un segundo usuario, dejar constancia explícita).
4. Revisar eventuales fixes, asegurar ausencia de regresiones y solicitar aprobación para merge. **NO merge** por el simple hecho de publicar este documento.
