# Gastro Core DEL-A / D2 — Pruebas DEV de asignación directa

## Antes de ejecutar
1. Confirmar que PostgreSQL es exclusivamente **DEV** y tiene respaldo; D2 añade la migración `20261029214500_del_a_d2_delivery_events` y cambia `prisma/seed.ts`. Ejecutar `npm run prisma:status`, `npm run prisma:deploy`, `npm run prisma:seed` **solo esta vez**, tras verificar conexión DEV. Nunca usar `db push`, reset ni migrar producción con esta guía.
2. Arrancar backend de la rama y traer `docs/del-a/Gastro_Core_DEL_A_D2_Delivery.postman_collection.json` a Postman.
3. Variables: `baseUrl` (ej. http://localhost:3000), `token` JWT Super Admin DEV, `sucursalId` de la sede, `varianteId` de catálogo con precio vigente, `courierId` ID de usuario activo con `delivery.courier` o `delivery.manage` en esa sucursal. **Para probar sin crear otro usuario**, puedes usar el mismo usuario administrador DEV como repartidor si tiene `delivery.manage`.
4. Dejar `deliveryRun` vacío en el primer recorrido. Para una nueva batería borrar `deliveryRun` y IDs guardados, pues Postman crea datos persistentes. Mantenerlo para reintentos idempotentes.
5. Ejecutar solicitudes **00–19 por orden**. Los pasos 02 y 17 demuestran asignación instantánea, sin aprobación. 08 inicia reparto y 10 completa. El paso 18 cancela una segunda entrega PENDIENTE con motivo; no cancela la orden ni registra un cobro. `enviarCocina:false` mantiene las órdenes fuera de cocina.
6. Comprobar `GET /api/deliveries/:id/events` y que todas las trazas corresponden a la orden y sucursal correctas. No mostrar teléfonos reales, JWT ni direcciones de clientes reales.
7. D2 **no crea `Pago` ni `MovimientoCaja`**, ni liquida efectivo o comisiones; eso es D3 PAY-A/FIN-A. No asumir que completar la entrega liquida el pedido.

## Comandos PowerShell (solo base DEV)
```powershell
git status
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
# Confirmar host y nombre de la base DEV / respaldo ANTES de migrar
npm run prisma:status
npm run prisma:deploy
npm run prisma:seed
npm run build
npm run start:dev
```

## Checklist de éxito
- Alta con `repartidorId` responde 201 y `repartidorId` queda persistido de inmediato.
- Replay de la misma clave no duplica; otra clave para la misma orden devuelve 409 (única `Entrega.ordenId`).
- Solo la transición válida `PENDIENTE -> EN_REPARTO -> ENTREGADA`; transición posterior incorrecta devuelve 409.
- Dirección/snapshot solo editable antes de despacho; cancelación requiere motivo, no segundo autorizante.
- `/events` muestra eventos con actor, estado y repartidor, sin exponer el domicilio/contacto en auditoría/outbox.
- No se efectuaron cobros ni afectaron saldos PAY-A/FIN-A.
