# DEL-A / D1 — Contrato y estrategia de implementación (2026-10-29)

**Base comprobada:** `main` SHA `36935d3a28758e46c672f49257de99c752a00db6`; FIN-A PR #12 fusionado; 124 modelos y 20 migraciones existentes. Referencia principal: `docs/checkpoints/2026-10-29_FIN_A_MERGE_DEL_A_HANDOFF.md`; issue #13.

**Estado de este documento:** diseño de implementación, no endpoint liberado ni prueba DEV ejecutada. El esquema y el código de `main` tienen prioridad si cambian.

## Propiedad, alcance y protección de datos

- `Cliente` y `DireccionCliente` ya existen. Cliente **no tiene sucursalId**. No se crea un cliente nuevo por cada pedido ni se supone que conocer su ID autoriza a consultar sus datos.
- Política conservadora propuesta para D1: conservar identidad global y añadir relación explícita `ClienteSucursal` (clienteId, sucursalId, creadaEn, índice/PK compuesto). Crear un cliente nuevo asocia a la sucursal operadora; los clientes históricos serán visibles en una sucursal cuando ya tengan `Orden`, `Venta` o `Reserva` en ella. **No** asignar registros históricos huérfanos a todas las sucursales.
- `GET/list` requieren sucursalId real, `customers.read` en esa sede, y vínculo verificable (explícito o histórico). Empleados de otra sucursal ven 404 en detalle, no datos personales.
- `create` requiere `customers.create` en la sede; modificar/inactivar cliente o direcciones exige `customers.manage`. **Un cliente compartido entre varias sucursales no podrá sufrir cambios sobre sus datos globales por un empleado local**; exigirá permiso global expreso `customers.global.manage` de rol de alcance GLOBAL. La lectura permanece limitada por sede.
- No inferir privilegio global por tener `customers.manage` en una sola sucursal o por el header `x-sucursal-id`. El permiso se verifica sobre rol activo, usuario activo, recurso y sede persistida. Se evita registrar teléfonos, NIT, correo y direcciones en auditoría/outbox/logs.
- No poner `@unique` global sobre NIT/teléfono/email por presunción: se puede atender a varias personas con un contacto compartido. No combinar clientes silenciosamente.

## Cambios aditivos de persistencia (antes de aplicar a DEV)

1. `ClienteSucursal` con claves foráneas RESTRICT e identidad compuesta; sin traslado destructivo de historiales.
2. `DireccionCliente.activa BOOLEAN NOT NULL DEFAULT true`: inactivación lógica sin romper FK históricas de `Entrega`.
3. Índice único parcial sobre `DireccionCliente(clienteId)` cuando `principal = true AND activa = true`, para cubrir carreras concurrentes. **Antes de desplegar**, ejecutar preflight agrupando por clienteId y detectar duplicados históricos; si existen, detener migración y revisar manualmente, sin borrar datos.
4. Operación de designar principal bajo transacción SERIALIZABLE con reintentos acotados por conflictos de serialización; nunca dejar simultáneamente dos principales.
5. Nada de migraciones automáticas contra PostgreSQL PROD ni `prisma db push`; revisar SQL, `prisma:status`, respaldo y destino.

## HTTP previsto D1 (prefijo global /api, no /v1)

| Método | Ruta | Ámbito | Contrato |
| --- | --- | --- | --- |
| GET | `/customers?sucursalId=...&page=1&limit=20&search=...` | customers.read | `{data,meta}`, orden estable |
| POST | `/customers` | customers.create | sucursalId, nombre, contacto opcional, claveOperacion |
| GET | `/customers/:id?sucursalId=...` | customers.read | detalle solo si es visible |
| PATCH | `/customers/:id` | customers.manage | sucursalId, campos mutables, claveOperacion |
| POST | `/customers/:id/deactivate` | customers.manage | sucursalId, motivo, claveOperacion |
| GET | `/customers/:id/addresses?sucursalId=...` | customers.read | direcciones activas de cliente autorizado |
| POST | `/customers/:id/addresses` | customers.manage | sucursalId, dirección, geocoordenadas opcionales como strings y claveOperacion |
| PATCH | `/customers/:id/addresses/:addressId` | customers.manage | sucursalId, campos, claveOperacion |
| POST | `/customers/:id/addresses/:addressId/primary` | customers.manage | sucursalId, claveOperacion |
| POST | `/customers/:id/addresses/:addressId/deactivate` | customers.manage | sucursalId, claveOperacion |

Validadores: longitudes, correo opcional, teléfono y NIT sin asumir formato fiscal estricto, coordenadas decimales válidas lat [-90,90] y lon [-180,180] (no geocodificar); listas paginadas; no filtrar PII en respuestas de error, logs, auditoría o outbox.

`claveOperacion` se liga a actor, operación y payload, con resultado congelado; mismo request devuelve mismo resultado; reutilización con datos distintos devuelve 409; una transacción es atómica. `PATCH` y desactivación conservan trazabilidad histórica.

## Dependencia directa ORD-A a revisar en D1

Actualmente `OrderStore.create` y `OrderStore.edit` aceptan clienteId si `Cliente.activo=true` **sin comprobar su visibilidad en la sucursal de la orden**. Deben exigir la misma política de vinculación/alcance desde un contrato público de Customers para no asociar desde una sede un cliente exclusivo de otra. No duplicar controladores ni motor de pedidos. En D2 la creación `Orden DELIVERY + Entrega` requiere una orquestación atómica definida con el dueño de Orders; no introducir una orden huérfana en D1.

## Pruebas mínimas D1 y salida de fase

- CI: `prisma:validate`, `build`, `test`, `test:e2e`, migration-smoke PostgreSQL 16.
- DEV: migración aplicada *solo* tras verificación de ambiente; dos sucursales y actores separados; crear/buscar/editar/inhabilitar cliente; dirección principal única y carrera de solicitudes; intento repetido con misma/diferente clave; entradas inválidas; cliente de otra sucursal y no activo; vínculo a ORD-A; comprobación de no exposición de PII.
- Colección Postman aislada con variables `baseUrl`, `token`, `sucursalId`, `otroSucursalId`, `clienteId`, `direccionId`, identificadores de operación nuevos.
- Mantener PR como DRAFT y registrar evidencia real antes de cerrar D1 o fusionar. El éxito de GitHub Actions no acredita base DEV.

## Límites posteriores

D2 es dueño de `Entrega/CanalExterno` y usa el motor ORD-A; D3 usa puertos PAY-A y FIN-A, sin insertar pagos o caja directamente desde Delivery; D4 cubre concurrencia real y seguridad. No comenzar RSV-A, QR-A, REP-A, FEL, hardware ni Angular.
