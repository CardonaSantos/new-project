# CHECKPOINT GASTRO CORE — 2026-10-28 — SUP-A

## Leer primero en el próximo chat de COFFEE SHOP
Continuar la **validación real con Postman** de SUP-A (macroflujo 20). No comenzar FIN-A ni fusionar SUP-A a main sin revisar el resultado de las pruebas funcionales del usuario. Este archivo documenta el estado en el HEAD previo a crear el checkpoint: `0cd9070dcbbcea694c37d54f3bf7a43f94c6a865` (CI SUCCESS).

## GitHub, progreso y ramas
- Repo backend: **CardonaSantos/new-project** (NestJS + Prisma 7 + PostgreSQL).
- **PUR-A está integrado en main**, PR #8 mergeado; commit `3aee4a0e0f8fe2fab750b225ddef16d3e3290bf2`; 47 respuestas CORE analizadas y las correcciones posteriores pasaron CI.
- **SUP-A**: rama `feat/sup-a-internal-supply`; PR #9 **ABIERTO / BORRADOR, NO MERGEADO**: https://github.com/CardonaSantos/new-project/pull/9 .
- Commit verificado antes de crear este archivo: `0cd9070dcbbcea694c37d54f3bf7a43f94c6a865` (bloqueo cancelación con compras activas). Última CI comprobada: https://github.com/CardonaSantos/new-project/actions/runs/40766314962 **SUCCESS** (compilación, pruebas y PostgreSQL migrations). Consultar HEAD y CI frescos en el siguiente chat.
- Plan: **16 bloques / 26 macroflujos**. Se completaron/integraron **10/16 bloques y 19/26 macroflujos** (incluyendo PUR-A). SUP-A es bloque 11 y flujo 20 **implementado en rama pero PENDIENTE de validación Postman y merge**; solo después pasar a **11/16 y 20/26**.
- Posteriores a SUP-A: **FIN-A #21, DEL-A #22 y #24, RSV-A #23, QR-A #25, REP-A #26**: 5 bloques y 6 macroflujos. FEL y equipos físicos quedan para fase posterior fuera de conteos.

## Política de UX DECIDIDA
- **Una acción por decisión real.** Flujo normal `Solicitar → Enviar → Recibir`, sin aprobación del administrador por defecto.
- **`EN_TRANSITO` interno automático**, no un clic de usuario. Enviar contabiliza salida; Recibir contabiliza entrada.
- **Traslado inmediato** sin requisición con `POST /api/supply/transfers/immediate`: una operación atómica salida+entrada, sin doble paso. También puede enviarse una requisición con `inmediato:true`.
- Recepción parcial: si salen 20 y llegan 18, registra 18 en destino y deja 2 en tránsito, sin inventar stock. Otra recepción por 2 completa; la requisición cierra sola al quedar atendida. Si 2 nunca aparecen, requiere conciliación posterior explícita, no pérdida silenciosa.
- INV-B conserva **Kardex, stock, FIFO/promedio, movimientos**, y PAY-A conserva caja. SUP-A coordina. PUR-A crea órdenes de compra con sus permisos; SUP-A solo origina una **propuesta en BORRADOR**.

## Código SUP-A en la rama
- `src/modules/supply/supply.module.ts`, `supply.controller.ts`, `supply.dto.ts`, `supply.store.ts`, `README.md`, `supply.store.spec.ts`.
- Integrado en `src/app.module.ts`; pruebas de contratos y DI `test/supply.e2e-spec.ts`, `test/supply-module.di.e2e-spec.ts`.
- API (con prefijo global `/api`):
  - `GET/POST /supply/requisitions` (listado requiere `sucursalId`).
  - `GET /supply/requisitions/:id`.
  - `GET /supply/requisitions/:id/availability?almacenOrigenId=...`.
  - `POST /supply/requisitions/:id/send` (normal o `inmediato:true`).
  - `POST /supply/requisitions/:id/purchase-draft` (OC PUR-A en borrador vinculada).
  - `POST /supply/requisitions/:id/cancel` (prohibido con tránsito o compras activas).
  - `POST /supply/transfers/immediate` (sin requisición previa).
  - `GET /supply/transfers/:id`.
  - `POST /supply/transfers/:id/receive` (cantidades reales / parciales).
- Se extendieron rutas INV-B para **prohibir recepción por motor genérico de transferencias SUP-A**, evitando doble posteo.
- Permisos nuevos en `prisma/seed.ts`: `supply.request`, `supply.read`, `supply.send`, `supply.receive`, `supply.cancel`. RBAC por sucursal; SUPER_ADMIN debe recibirlos al ejecutar seed.
- PUR-A enlaza `OrdenCompra.requisicionId` opcionalmente; controla cantidades comprometidas y borradores duplicados, revisa propuestas abiertas y no deja cancelar solicitudes con compras activas. **La recepción comercial confirmada en bodega destino** acredita `cantidadAtendida`, nunca antes. No compra automáticamente.
- Migración aditiva **`prisma/migrations/20261028192500_sup_a_purchase_requisition_link/migration.sql`**: FK opcional e índice de `OrdenCompra.requisicionId`; preserva compras históricas.
- Transacciones SERIALIZABLE, idempotencia con `claveOperacion`, auditoría y outbox; conservan costos de tránsito en recepción parcial.

## Tests y siguiente actividad
- CI más reciente arriba **verde**, pero **NO significa que la DB real de pruebas del usuario fue ejercitada**.
- La ejecución del siguiente chat debe:
  1. Verificar GitHub PR #9, HEAD y CI, luego `git status` y `git pull --ff-only origin feat/sup-a-internal-supply` sin sobrescribir cambios.
  2. **Respaldar DB de desarrollo** y verificar `DATABASE_URL` / `DIRECT_URL`; ejecutar `npm run prisma:deploy`, `npm run prisma:status`, `npm run prisma:seed`, `npm run build`, `npm run start:dev` según corresponda.
  3. Iniciar sesión vía `POST /api/auth/login` si JWT expiró y validar `GET /api/auth/capabilities` con `SUPER_ADMIN` GLOBAL.
  4. Ejecutar colección Postman SUP-A sobre DB de desarrollo: usar ID reales de almacenes, ubicaciones, artículos y sucursales. Pruebas: crear requisición 20, existencia, enviar, confirmar origen -20, destino sin entrada hasta recepción, recibir 18 y después 2, confirmar tránsito parcial, Kardex/costos, cierre automático, reintentos idempotentes; sobreenvío/stock insuficiente; traslado inmediato con y sin requisición; proveedor/OC PUR-A BORRADOR y recepción al destino; cancelación bloqueada con tránsito o compras activas; permisos por sucursal.
  5. Analizar JSON y resultados Runner uno por uno, fijar problemas en la rama SUP-A, repetir CI; **solo después fusionar PR #9**.
- El PR #9 menciona una colección Postman de 24 peticiones como preparada, pero su archivo **no está verificado en este checkpoint como existente en GitHub**. Si no se encuentra, crear colección CORE con rutas y scripts de captura de variables.
- Pendiente explícito de diseño: conciliación de pérdida definitiva en tránsito sin crear stock ficticio. UI Angular sigue futura.

## Fuentes de verdad
- PR #9: https://github.com/CardonaSantos/new-project/pull/9
- Código/contratos: `src/modules/supply/README.md` y controladores reales en rama.
- Plan maestro: `GASTRO_CORE_GUIA_MAESTRA_DESARROLLO.md` del Proyecto; su resumen de progreso es una versión anterior, prevalece el estado verificado arriba.
- Documento descargable complementario preparado en el chat: `GASTRO_CORE_CHECKPOINT_2026-10-28_SUP_A.md`.

**Próximo chat esperado: usuario entregará pruebas reales Postman SUP-A. Continuar desde aquí y NO reiniciar el diseño.**
