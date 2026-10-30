# Gastro Core — DEL-A D1 / ORD-A integración y endurecimiento

**Fecha:** 2026-10-29. **Repo:** https://github.com/CardonaSantos/new-project.
**Rama:** `feat/del-a-customers-delivery`; **PR:** #14 DRAFT; `main` conserva FIN-A en `36935d3`.
**Commit de integración antes de este checkpoint:** `6f96475197536f7a7bda62cd764d8db02b93e27d`.

## 1. Evidencia DEV enviada por el usuario

Primera colección D1 Customers, 16 solicitudes: el usuario compartió 15 respuestas con resultado esperado y **omitió la prueba multisucursal por contar con una sola sucursal**. Comprobaciones observadas: creación, reintento con misma clave y mismo ID, 409 al reutilizar clave con distinto payload, dirección principal exclusiva, 400 por GPS inválido, cambios y desactivaciones lógicas, permanencia del histórico, 400 por omitir sucursal. No es evidencia de permisos por rol diferenciado, carga concurrente, ni asociación ORD-A.

## 2. Integración nueva: evita transacciones desacopladas

- Se mantiene el puerto `CustomerSelectionPort` como contrato interno; método `assertSelectableInTx(transaction: unknown, actorId, sucursalId, clienteId)` recibe **la transacción SERIALIZABLE original** de `InventoryPostingEngine.tx` en ORD-A. `unknown` aísla la capa de aplicación del ORM; el adaptador Prisma realiza el cast explícito.
- Dentro de ese contexto se verifica `customers.read` para el **actor y sucursal efectiva**, que la sucursal está activa, se bloquea fila de Cliente con `SELECT ... FOR SHARE` y se requiere cliente visible (vínculo ClienteSucursal u Orden/Venta/Reserva histórica) y `activo=true`.
- `OrderStore.create` usa `d.sucursalId`; `OrderStore.edit` usa **`order.sucursalId` persistido**. Ninguna de estas comprobaciones puede abrir una segunda transacción. Deactivación de clientes toma `FOR UPDATE`; el aislamiento SERIALIZABLE reintenta conflictos.
- `orders.create` y sucursal activa se revalidan **antes de buscar la clave idempotente**: no se devuelven respuestas de operaciones anteriores tras revocar permisos.
- Crear sin `clienteId` no exige `customers.read`; tampoco se modifica PAY-A, FIN-A, stock, facturas o reservas.

## 3. Pruebas de código y CI

- `src/modules/customers/infrastructure/prisma/customers.store.spec.ts`: éxito de cliente activo, rechazo inactivo y sin autorización, comprobación de que no se abre transacción aparte.
- `src/modules/orders/infrastructure/prisma/customer-order.integration.spec.ts`: creación, orden de validación, reversión ante denegación, customerId nulo, edición ligada a sucursal real, permiso revocado e invariantes sin escrituras cuando hay error.
- Previo a último ajuste de idempotencia, CI: https://github.com/CardonaSantos/new-project/actions/runs/40953373222 **SUCCESS** (171 unitarias + 67 HTTP; PostgreSQL migration-smoke SUCCESS).
- La CI del HEAD con endurecimiento de replay y checkpoint debe verificarse antes de declarar verde el incremento.
- Colección Postman específica: `docs/del-a/Gastro_Core_D1_ORD_A_Integration.postman_collection.json` con **16 solicitudes** (01–14 más 02b y 00), variable `varianteId` elegida manualmente; `docs/del-a/D1_ORD_A_INTEGRATION_DEV.md` tiene requisitos/comandos y expectativas de HTTP.

## 4. Próximo paso real (DEV)
- El usuario ha probado solo D1 Customers en una única sucursal. La validación ORD-A con cliente activo, inactivo, ajeno, edición y cambio entre dos clientes activos sigue **pendiente** contra DEV.
- Se requieren `orders.create`, `orders.manage`, `orders.read`, `customers.create`, `customers.read`, `customers.manage` al usuario de prueba. Para el escenario opcional sin permiso customers.read se debe proporcionar un JWT de usuario con orders.create pero sin customers.read.
- Un producto/variante vendible con precio en sucursal DEV. La colección desactiva envío automático a cocina (`enviarCocina:false`) y nunca debe ejecutarse en producción. Se crean órdenes de prueba persistentes.
- Prueba cruzada de sucursal y carrera de direcciones quedan pendientes por infraestructura DEV actual; registrar el gap, no simular éxito.
- **Este incremento no tiene cambios en `prisma/schema.prisma`, migraciones ni seed**. No ejecutar comandos Prisma por rutina. Basta pull/build/start.
- No mergear PR #14 hasta pruebas de DEV y autorización explícita. D2 y D3 no iniciados en este incremento.

## 5. Comandos locales (PowerShell)
```powershell
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
npm run build
npm run start:dev
```
