# GASTRO CORE — DEL-A / D1 — Implementado en rama, pendiente PostgreSQL DEV
**Fecha:** 2026-10-29 (Guatemala) · **Checkpoint base:** `docs/checkpoints/2026-10-29_FIN_A_MERGE_DEL_A_HANDOFF.md`.

## 1. Estado y referencias verificables
- Repositorio: https://github.com/CardonaSantos/new-project
- `main` inicial: `36935d3a28758e46c672f49257de99c752a00db6` (FIN-A PR #12 fusionado).
- Rama: `feat/del-a-customers-delivery`. PR: https://github.com/CardonaSantos/new-project/pull/14 (DRAFT; **no fusionar hasta QA DEV**).
- HEAD de código previo a este checkpoint: `b2cb495f3f5214720237888bd540523cc5ea4ff1`.
- CI verde comprobada antes del último incremento de options: https://github.com/CardonaSantos/new-project/actions/runs/40938476707 — **161 unitarias, 66 HTTP**, Prisma validación/build y PostgreSQL migration-smoke, incluyendo prueba de unicidad de dirección. El HEAD de options requiere verificar su CI nueva antes de asegurar aprobación.
- `main` sigue con 12/16 bloques funcionales y 21/26 macroflujos del plan. D1 es parte de DEL-A y **no** justifica marcar todo DEL-A terminado.

## 2. Código incorporado solo en rama DEL-A
- `src/modules/customers/`: módulo Nest, dominio sin ORM, `CustomersService`, `CustomersPort`, `CustomerSelectionPort`, DTO/Controller y `CustomersStore` Prisma.
- `src/app.module.ts`: nuevo CustomersModule; `OrdersModule` importa su puerto público para validar `clienteId` sobre sucursal y usuario antes de asociarlo en creación/edición.
- `prisma/schema.prisma`: `ClienteSucursal` explícita sin duplicar `Cliente`, `DireccionCliente.activa`, índices para relaciones históricas por `clienteId,sucursalId`.
- `prisma/migrations/20261029195000_del_a_customer_scope/migration.sql`: SQL **aditivo y transaccional** (BEGIN/COMMIT); falla por principales históricas duplicadas y no borra datos. Índice parcial garantiza máximo una dirección principal activa por cliente.
- `prisma/seed.ts`: `customers.read`, `customers.create`, `customers.manage`, `customers.global.manage`; solo SUPER_ADMIN adquiere permisos vía seed por defecto. Los demás requieren asignación explícita.
- `prisma/ci/del-a-d1-integrity.sql`: fixture efímero que comprueba el índice parcial con excepción controlada, rollback total. No se usa para migrar datos reales.
- Unit tests del dominio y store; `test/customers.e2e-spec.ts` comprueba validadores, HTTP 200/201/400, opciones mínimas y cache-control de consultas.
- Postman DEV: `docs/del-a/Gastro_Core_DEL_A_D1.postman_collection.json` + instrucciones `docs/del-a/D1_POSTMAN_DEV.md`.

## 3. Contratos HTTP de código actual (prefijo `/api`)

| Método | Path | Requisito |
| --- | --- | --- |
| GET | `/customers?sucursalId=&page=&limit=&search=` | customers.read; paginación `{data,meta}` |
| GET | `/customers/options?sucursalId=&search=&cursor=&limit=` | customers.read; `{data,nextCursor}`, solo id/nombre |
| POST | `/customers` | customers.create; claveOperacion idempotente |
| GET | `/customers/:id?sucursalId=` | customers.read; ámbito verificable |
| PATCH | `/customers/:id` | customers.manage; cliente compartido requiere privilegio global |
| POST | `/customers/:id/deactivate` | customers.manage; conserva histórico |
| GET | `/customers/:id/addresses?sucursalId=` | customers.read |
| POST | `/customers/:id/addresses` | customers.manage, escritura atómica |
| PATCH | `/customers/:id/addresses/:addressId` | customers.manage |
| POST | `/customers/:id/addresses/:addressId/primary` | customers.manage, una principal activa |
| POST | `/customers/:id/addresses/:addressId/deactivate` | customers.manage, baja lógica |

Las mutaciones exigen `sucursalId` y `claveOperacion`, con permiso sobre actor/sucursal real, hash de solicitud e `OperacionIdempotente`. Se preservan las relaciones contables y de entrega; auditoría/outbox no almacenan NIT/telefono/email/direccion/notas.

## 4. Privacidad y dependencia con contextos
- Clientes globales, visibilidad **restringida** por `ClienteSucursal` o relación histórica `Orden/Venta/Reserva` con la sucursal.
- Un empleado de otra sucursal no debe recibir datos personales por conocer `clienteId`; para cambios en clientes compartidos entre sucursales se exige `customers.global.manage` en rol GLOBAL.
- `ORD-A`: ahora solicita `CustomerSelectionPort.assertSelectable` en create/edit; `clienteId` activo no basta si no existe autorización.
- `PAY-A` y `FIN-A`: sin alteración de cobros, cuentas, asientos o cierres.
- `DEL-A D2`: usará `Cliente/DireccionCliente`, pero deberá persistir un snapshot histórico de dirección en `Entrega`.
- `RSV-A` futuro podrá usar `Cliente` existente. No implementar reservaciones en D1.

## 5. Pendiente para declarar D1 cerrado
1. Confirmar CI del HEAD más reciente y cualquier corrección posterior.
2. Revisar el estado de PostgreSQL **DEV real** y las direcciones principales existentes; aplicar migración/seed únicamente tras confirmar ambiente y respaldo.
3. Ejecutar colección Postman 00–15. Complementar con usuario real de otra sucursal, rol limitado y pruebas simultáneas para direcciones principales.
4. Probar ORD-A POST/PATCH con cliente local, ajeno e inactivo y comprobar que no se alteran cobros, Kardex ni histórico.
5. Registrar evidencias, resolver decisiones de edición global de clientes compartidos, actualizar PR #14 e Issue #13. No fusionar sin autorización.
6. Solo después de aprobar D1, desarrollar D2 (Entrega/repartidor), D3 (cobro liquidación PAY-A/FIN-A) y D4 (hardening). No comenzar RSV-A, QR-A, REP-A, FEL, hardware o Angular.

**Certeza:** `[IMPLEMENTADO EN RAMA]` código D1; `[CI]` según run citado; `[PENDIENTE DEV]` migraciones locales y Postman. No declarar fin de DEL-A, no subir JWT ni PII.
