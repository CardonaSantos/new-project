# Gastro Core — Checkpoint de cierre e integración en main
**Fecha:** 2026-11-05 (Guatemala)
**Hito:** POS Express + KDS + Cobros + interfaz completa, backend y Angular integrados.
**Estado:** Código fusionado en `main`; pruebas automatizadas de ramas aprobadas; pendiente la aceptación funcional y de impresión física final.

## 1. Puntos de integración inmutables

| Repositorio | PR de integración | Commit merge a main | Base integrada |
| --- | --- | --- | --- |
| Backend — [CardonaSantos/new-project](https://github.com/CardonaSantos/new-project) | [#30](https://github.com/CardonaSantos/new-project/pull/30) | [`5b1f539557d06738d7d504d1937c683f6bcc43e5`](https://github.com/CardonaSantos/new-project/commit/5b1f539557d06738d7d504d1937c683f6bcc43e5) | `feat/pos-orders-kitchen-express-20261105` |
| Angular — [CardonaSantos/new-project-angular-ui](https://github.com/CardonaSantos/new-project-angular-ui) | [#28](https://github.com/CardonaSantos/new-project-angular-ui/pull/28) | [`fa1ddc7f510e05de427c5c4a12f8f9922e4e616e`](https://github.com/CardonaSantos/new-project-angular-ui/commit/fa1ddc7f510e05de427c5c4a12f8f9922e4e616e) | `refactor/pos-orders-kds-express-ui-20261105` |

**CI de las ramas de integración:**
- Backend #30: [GitHub Actions aprobada](https://github.com/CardonaSantos/new-project/actions/runs/42059379800) — compilación, pruebas unitarias, HTTP y smoke de migraciones en PostgreSQL.
- Angular #28: [GitHub Actions aprobada](https://github.com/CardonaSantos/new-project-angular-ui/actions/runs/42083224701) — `npm ci`, lint, build y pruebas.
- Los commits de fusión y este propio checkpoint ejecutan sus pipelines de `main` por separado. No interpretar la aprobación de rama como aceptación manual en producción.

## 2. Backend — funcionalidad consolidada en main

El PR #30 entrega los contratos de siete operaciones Express:
1. `POST /api/orders/quote`: cotización autoritativa con precios de servidor.
2. `POST /api/pos/quick-checkout`: venta directa cobrada y cerrada, atomía de pago, venta e inventario.
3. `POST /api/orders/:id/pay-and-send`: cobrar cuenta elegible y enviar líneas pendientes a Cocina.
4. `GET /api/orders/worklist`: órdenes abiertas, mesas y métricas paginadas.
5. `GET /api/kitchen/queue`: cola global de cocina con prioridad y contadores.
6. `POST /api/kitchen/tickets/:id/ready-deliver`: marcar listo y entregado de forma atómica.
7. `POST /api/kitchen/lines/:id/ready-deliver`: lo mismo para una línea.

Se conservan FIN-A/PAY-A, órdenes, mesas, inventario, recetas y los contratos anteriores. El PR #30 no añade migraciones de Prisma.

**Invariante de comandas** — En `src/modules/orders/infrastructure/prisma/kitchen.store.ts`, `sendTx` genera líneas de comanda solo para `PREPARADO`. Los artículos `INVENTARIABLE` se registran como consumo directo de inventario. Por ello las botellas no aparecen en la comanda de preparación; sí deben aparecer en la impresión completa de la orden.

## 3. Angular — funcionalidad consolidada en main

La rama final del PR #28 incorporó por ancestría todos los PRs #18 a #27 (cadena acumulada desde `main`). PR #29 se había integrado como segundo padre en la historia de PR #28. Esta entrega incluye:
- Recetas y ciclo de versiones; organización y formularios/selectores reutilizables; catálogo, inventario y usuarios.
- POS, órdenes, mesa activa, reingreso a pedido existente, mesas ocupadas y prevención de duplicaciones de orden.
- Carrito compacto: selecciones idénticas suman cantidad en una sola línea; modificadores, notas y descuentos distintos permanecen separados.
- Cotización y cobro Express con footer fijo, permisos, comprobantes y caja.
- Cocina: KDS global, estados, tiempos, preparación, entrega, tickets y reimpresión.
- **Dos impresiones 80 mm distintas:** *Comanda de preparación* (solo PREPARADO) y *Comanda completa* (líneas activas de orden, incluido INVENTARIABLE).
- PAY-A, caja/turnos, pagos parciales, división de cuentas, compras/recepciones, dashboard y reportes.
- Compactación visual de cabecera POS, selector de mesas, catálogo, detalle de orden y cobros.

**Auditoría de PRs apilados:** #18 y #19 quedaron marcados como fusionados automáticamente al integrarse su historia; #20–#27 se cerraron como ya incluidos (sus HEADs son ancestros de `main`, sin commits propios pendientes). PR #28 quedó fusionado.

**Exclusión deliberada:** PR UI [#6](https://github.com/CardonaSantos/new-project-angular-ui/pull/6) es una rama antigua divergente y no forma parte de la cadena de este hito; NO se fusionó para no introducir cambios obsoletos.

## 4. Comprobaciones pendientes antes de declarar QA final

1. Verificar en PostgreSQL local: dos aguas idénticas como cantidad 2, saldo y consumo de stock correctos, modificadores de capuchino y no duplicación del pedido en mesa ocupada.
2. Comprobar caja abierta/cerrada, pago Express con efectivo, tarjeta autorizada, idempotencia tras error de red y cobro/envío sin fraccionamiento.
3. Comprobar que la comanda de preparación excluye INVENTARIABLE y que la comanda completa los muestra. Imprimir físicamente en térmica de 80 mm.
4. Revisar UI en Firefox/Chrome, zoom 90%, alturas pequeñas y vistas 390/768/1366 px; teclado y permisos.
5. Confirmar CI en los `main` definitivos (incluidos los commits documentales); revisar posible despliegue automático si Railway está configurado para `main`.

## 5. Regresar a main local

**Servidor** (ejecutar desde el directorio `new-project`):
```powershell
git status
git fetch origin
git switch main
git pull --ff-only origin main
npm ci
npm run start:dev
```

**Angular** (ejecutar desde `new-project-angular-ui`):
```powershell
git status
git fetch origin
git switch main
git pull --ff-only origin main
npm ci
npm start
```

Si `git status` muestra cambios sin guardar, confirmarlos o guardarlos con stash antes de `switch`. No se requieren migraciones nuevas por PR #30. El checkpoint refleja la integración de código, no una certificación de despliegue en producción.

## 6. Referencias operativas

- Backend historial: `docs/checkpoints/2026-11-05_POS_ORDERS_KDS_EXPRESS_BACKEND.md`.
- Angular: `docs/checkpoints/2026-11-05_POS_EXPRESS_UI_CONSOLIDATED.md`, `2026-11-05_POS_CART_COMPACT_AND_MERGE.md`, `2026-11-05_ORDERS_POS_PAYMENTS_COMPACT_PRINT.md`, `2026-11-05_POS_COMPACT_AND_COMPLETE_ORDER_PRINT.md`, `2026-11-05_EXPRESS_DIALOG_PRINT_SWITCH_POS_HEADER.md`.
- Este checkpoint queda replicado en ambos repositorios para reanudación.
