# Gastro Core — RSV-A / Aceptación funcional DEV y cierre de desarrollo

**Fecha:** 30 de octubre de 2026 · **PR:** https://github.com/CardonaSantos/new-project/pull/16  
**Rama:** `feat/rsv-a-reservations` · **Estado:** aceptación DEV documentada, pendiente fusión verificada por GitHub.
**Decisión del producto:** NO correo, SMS, recordatorios automáticos, job programado de notificación ni proveedor externo. Los modelos legacy de recordatorios permanecen sin uso.

## R1–R4 implementadas

1. **R1 Disponibilidad/agenda.** Consultas por sucursal/fecha/horario/capacidad, filtros de mesas/salas activas, solapamientos, sugerencias de mesa y `FOR UPDATE` con transacciones SERIALIZABLE para actualizaciones.
2. **R2 Gestión.** Crear invitado o reserva ligada a Customer, reservar mesa individual o combinaciones de mesas; `PENDIENTE` opcional / `CONFIRMADA` por defecto; editar, confirmar, cancelar con motivo y no-show controlado, con auditoría. Reintentos idempotentes en create y transiciones; permisos de lectura/gestión por sucursal.
3. **R3 Llegada y ORD-A.** Check-in sin aprobación extra, ocupación de mesa vinculada, protección contra solapamientos y reapertura indebida; pedido ORD-A reutiliza `OcupacionMesa`.
4. **R4 UX/API enriquecida y calidad.** GET paginado y detalle con datos de cliente/sucursal/sala/mesas/aforo/ocupaciones/órdenes/historial y actor; `faseAtencion` y estado de ocupación real para no confundir `COMPLETADA` de reserva con finalización de servicio; cambios auditados por nombres de campos sin duplicar PII en eventos.

**Sin migraciones nuevas RSV-A.** Los modelos de reservas ya estaban en el esquema; el seed incluye `reservations.read` además del permiso `reservations.manage` preexistente.

## Evidencia de Postman DEV del usuario

### Primera colección (11 requests, 00–10)
- Creación CONFIRMADA, detalle enriquecido, rechazo 409 de mesa solapada, edición con eventos, check-in/replay idempotente y ocupación única.
- `POST /api/orders` con modalidad MESA reutilizó `OcupacionMesa.id=cmvv9mbyo000c9sv44173m8w6` de la reserva `cmvv9k3uf00029sv4ws7rh5ho`, orden `cmvv9ms2z000h9sv4vtdsiar9` Q22 ABIERTA.
- Cancelar reserva ya atendida respondió 409 esperado. Listado enriquecido incluyó Orden y último evento.
- El resultado de 00 se compartió después como RESERVADA, por lo que no demostró la disponibilidad inicial; el segundo conjunto resolvió esta duda.

### Colección complementaria (17 requests, 00–16)
- **17/17 escenarios correctos**, sin errores de negocio inesperados. 00 mesa T-01 libre y sugerida; 01 PENDIENTE; 02 RESERVADA; 03 CONFIRMADA; 04 mismo evento (replay); 05 400 motivo corto; 06 CANCELADA con motivo y actor; 07 replay sin nuevo evento; 08 libre.
- 09 nueva mesa sintética `cmvvankmn000dwkv4pjigp9of`; 10 reserva combinada `cmvvant42000fwkv4t6rv74mz` para 5 personas en 2 mesas, aforo 6; 11 bloqueo de ambas mesas para el mismo ID; 12 detalle completo; 13 conflicto 409 a intento de doble reserva; 14 cancelada; 15 mesa sintética inactiva; 16 mesa T-01 libre y mesa sintética excluida del calendario.
- Reserva PENDIENTE → CONFIRMADA → CANCELADA `cmvvalqhb0001wkv4okc9qwxf`; eventos no duplicados.

### Concurrencia HTTP real — evidencia recibida en consola PowerShell
- El usuario ejecutó `node .\\scripts\\rsv-a-concurrency-dev.mjs` desde el backend DEV contra PostgreSQL local, misma mesa `T-01`, mismo horario futuro, dos POST simultáneos, distintas claves de operación.
- **Salida:** `Two simultaneous reservations: 201 409` → `PASS: one winner, one conflict; availability linked to winner`.
- **Cleanup:** `cmvvb1q23000swkv4f46njcat` cancelada, HTTP **201**.
- Confirma al menos una ejecución real de la contención por mesa en DEV; **no** demuestra rendimiento ni ausencia de deadlocks a escala de cientos de usuarios.

## Integridad CI y estado de código

- Código RSV-A HEAD antes del checkpoint: `2ba994de0a7b1bb4cf04b7263ee3ef85df5efca3`.
- GitHub Actions: https://github.com/CardonaSantos/new-project/actions/runs/41104390578 **SUCCESS** (228 unitarias, 82 HTTP, Prisma/build y PostgreSQL migration-smoke).
- La prueba de política de NO_ASISTIO antes/después de inicio+15 minutos se cubre en unitarias; **no se ejecutó manualmente en DEV**.
- Se verificó lógica y pruebas con roles/sucursales sintéticos, pero **no existe evidencia de usuario real de solo lectura y otra sucursal en DEV**.
- No hay horarios comerciales/feriados semanales configurados; no se inventó política de apertura. El servicio no envía email, SMS ni avisos.
- No se ha medido latencia p95/p99 bajo carga ni se certificó despliegue de producción.
- La orden ORD-A creada en la primera prueba, `cmvv9ms2z000h9sv4vtdsiar9`, quedó ABIERTA y ocupación `cmvv9mbyo000c9sv44173m8w6` abierta al último GET del usuario. Cerrar/cancelar por APIs oficiales cuando proceda; **no** alterar estado directamente en SQL.

## Criterio de aceptación

**RSV-A R1–R4 aceptado como backend funcional DEV**: flujos normales, excepciones básicas, datos enriquecidos y contención real validada. NO afirmar certificación de producción. El propietario pidió cerrar el módulo después de compartir la prueba de concurrencia correcta; el merge y SHA resultantes deben verificarse en GitHub.

Pendientes fuera del alcance de la aceptación DEV (seguimiento preproducción):
1. Escenario manual `NO_ASISTIO` tras la tolerancia de 15 min, reintento y disponibilidad recuperada.
2. RBAC HTTP con usuario de solo lectura y otra sucursal para probar 403 y aislamiento.
3. Prueba de carga multicliente y capacidad/latencias p95/p99; refinar optimización automática multi-mesa si el uso comercial lo demanda.
4. Definición de calendario comercial y cierres extraordinarios, si el restaurante los necesita.
5. Cierre operacional de orden/ocupación sintética de la primera prueba sin editar DB por fuera de ORD-A/PAY-A.

**Siguiente módulo:** QR-A Autoservicio. La UI Angular consumirá los endpoints enriquecidos y conservará acciones únicas con estados claros sin exponer IDs manuales.
