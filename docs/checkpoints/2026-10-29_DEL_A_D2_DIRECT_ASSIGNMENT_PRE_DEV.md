# GASTRO CORE — DEL-A / D2 — ASIGNACIÓN DIRECTA (PRE-DEV)

**Fecha:** 2026-10-29, Guatemala.
**Repositorio:** https://github.com/CardonaSantos/new-project
**Rama:** `feat/del-a-customers-delivery`
**PR:** https://github.com/CardonaSantos/new-project/pull/14 — DRAFT, no fusionado.
**Main:** `36935d3a28758e46c672f49257de99c752a00db6` previo a DEL-A.

## Decisión operativa explícita
La **asignación de repartidor es directa**: nunca crear flujo de autorización de asignación ni paso de confirmación por un segundo empleado. Validar permisos y pertenencia a sucursal dentro del comando de asignación, en segundo plano, sin añadir pantallas/pasos al operador. La creación de una entrega admite `repartidorId` para alta+asignación con una sola petición.

## Código implementado en la rama
- Nuevo `DeliveryModule` con dominio, puerto de aplicación, servicio, adapter Prisma y HTTP controller; registrado en AppModule.
- D2 conserva `Entrega`, `Orden`, `DireccionCliente`, `Usuario`, `CanalExterno` originales, y utiliza `Entrega.ordenId @unique` existente para prohibir duplicados.
- Migración aditiva transaccional `prisma/migrations/20261029214500_del_a_d2_delivery_events/migration.sql`: `EntregaEvento` con FK, actor, estado origen/destino, asignación anterior/nueva y motivo, índice entrega/fecha. **No toca pagos, cajas, cierres o kardex.**
- `prisma/seed.ts` añade permisos `delivery.read` y `delivery.courier`; `delivery.manage` ya existía. Solo SUPER_ADMIN recibe nuevos permisos al correr seed; rol de repartidor configurado con RBAC existente, sin autorizaciones de asignación.
- Consultas limitadas a sucursal efectiva de la orden. Operador `delivery.read/manage` ve sucursal; `delivery.courier` únicamente sus entregas asignadas. La asignación exige usuario activo con rol de courier/gestión habilitado en la sucursal.
- Estado: PENDIENTE -> EN_REPARTO -> ENTREGADA, con PENDIENTE/EN_REPARTO -> CANCELADA mediante gestión y motivo. ENTREGADA y CANCELADA terminales; origen Orden cancelada bloquea despacho/entrega.
- Snapshot del domicilio/telefono en Entrega. Si `direccionId` se usa, debe pertenecer al cliente de la Orden y estar activa. Destino solo editable antes de salir.
- Mutaciones SERIALIZABLE + retries + OperacionIdempotente + EntregaEvento + EventoAuditoria y EventoOutbox en la misma transacción. No persistir direcciones/contactos en audit/outbox genéricos.
- D2 no establece importes `cobrableContraEntrega` / `costoEnvio` distintos de 0, no registra Pago ni MovimientoCaja ni liquidaciones: D3 se encarga de PAY-A/FIN-A.

## HTTP nuevos (/api)
- `GET /deliveries?sucursalId=&page=&limit=&estado=&repartidorId=`: lista y paginación.
- `GET /deliveries/:id`: detalle según rol y sucursal real.
- `GET /deliveries/:id/events`: historial auditable.
- `POST /deliveries`: registrar dirección snapshot, canal externo opcional y repartidor opcional (asignación directa al registrar).
- `PATCH /deliveries/:id/destination`: cambiar destino mientras PENDIENTE.
- `POST /deliveries/:id/assign`: **asignación inmediata**, no hay endpoint de solicitud/aprobación.
- `POST /deliveries/:id/dispatch`: EN_REPARTO sin paso de autorización.
- `POST /deliveries/:id/complete`: ENTREGADA sin tocar cobro.
- `POST /deliveries/:id/cancel`: CANCELADA, motivo de gestión.

## Estado verificable
- Último CI verde **antes del test de asignación adicional**: https://github.com/CardonaSantos/new-project/actions/runs/40959822626 (verify + migration-smoke SUCCESS).
- CI del commit de prueba directa: https://github.com/CardonaSantos/new-project/actions/runs/40959989313 — confirmar conclusión antes de declarar HEAD validado.
- Pruebas unitarias de policy, adapter Prisma, HTTP con validación de payloads. Colección Postman DEV con 20 solicitudes: `docs/del-a/Gastro_Core_DEL_A_D2_Delivery.postman_collection.json`; guía `docs/del-a/D2_POSTMAN_DEV.md`.
- **PENDIENTE DEV real:** actualizar branch local; verificar conexión PostgreSQL DEV y backup; aplicar **esta vez** D2 SQL y seed; ejecutar Postman 00–19 y revisar respuestas. La CI no aplicó migraciones al entorno local del usuario.
- D1 Customers y enlace ORD-A previamente probados por usuario en DEV; prueba de roles restringidos/multisucursal omitida por decisión/infraestructura actual, no simularla como validada.
- D3 liquidación de repartidores y plataformas, pagos y conciliación en PAY-A/FIN-A **NO INICIADO**. D4 auditoría/QA integral pendiente.
- Mantener PR #14 DRAFT. No merge hasta autorización expresa.

## Comandos locales (PowerShell, ejecución DEV)
```powershell
git status
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
# Solo si DATABASE_URL / DIRECT_URL apuntan a DEV, respaldado:
npm run prisma:status
npm run prisma:deploy
npm run prisma:seed
npm run build
npm run start:dev
```
