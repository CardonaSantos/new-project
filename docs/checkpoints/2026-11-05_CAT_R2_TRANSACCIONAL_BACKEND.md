# Gastro Core — CAT R2 Backend, handoff 2026-11-05

**Base:** `main@a6eaab6f06df8a251c3257402c592c7b3d0522ef`
**Branch:** `feat/catalog-r2-atomic-setup-readiness-20261105`
**PR:** https://github.com/CardonaSantos/new-project/pull/31
**UI asociada:** https://github.com/CardonaSantos/new-project-angular-ui/pull/32 (incluye UI R1 + R2)

## Nuevas operaciones (contratos aditivos)
1. **POST /api/catalog/products/setup** (`ProductSetupDto`): producto y de 1 a 50 variantes, artículos terminados NUEVOS opcionales y precios de sucursal opcionales. Una transacción SERIALIZABLE. `nuevoArticulo` por variante incluye `codigo`, `nombre`, `unidadBaseId?`, `requiereLote?`, `requiereVencimiento?`. Si se omite unidad, usa una unidad base activa de dimensión `UNIDAD`. Alternativamente `articuloInventarioId` existente. No aceptar ambas opciones juntas. Respuesta: producto con `preciosConfigurados` por variante. **Stock inicial = cero**; no crea movimientos de kardex ni posiciones ficticias.
2. **POST /api/catalog/prices/variants/batch** (`VariantPricesBatchDto`): `precios: PriceCreateDto[]`, 1–50, por variante/sucursal; valida permisos y solapes en una única transacción, todo o nada.
3. **POST /api/catalog/menus/:id/commit** (`MenuLayoutDto`): guarda secciones, horarios, sucursales y publica en una transacción con `expectedVersion`; validación de readiness antes del commit, rollback si falla; conserva la carta publicada.
4. **GET /api/catalog/products/:id/readiness** (mismo contrato con campos nuevos): PREPARADO necesita receta VENTA publicada activa y estación/ruta de cocina con ubicación de consumo; INVENTARIABLE necesita vínculo terminado activo con unidad base UNIDAD; precio, visibilidad, foto y sucursal mantienen verificaciones.

## Separación de permisos
- Crear producto: `catalog.manage` global.
- Crear artículo físico: adicional `inventory.articles.manage` global.
- Crear precios: adicional `catalog.prices.manage` por cada sucursal.
- Guardar/publicar carta: `catalog.menus.manage` global.

## Calidad
- Prisma existente sin migraciones nuevas.
- Endpoints anteriores se conservan.
- CI del HEAD backend [GitHub Actions 42118905641](https://github.com/CardonaSantos/new-project/actions/runs/42118905641): build, unit, HTTP, PostgreSQL migration smoke aprobados.
- **Pendiente:** QA funcional en PostgreSQL real de las *nuevas* mutaciones (los test HTTP usan proveedores simulados), concurrencia, rollback al fallar la segunda variante o un precio, control 409 de versión y permisos entre sucursales. No confundir con migration smoke.

## Escenarios UAT
- «Flan» + presentación única + artículo `PRODUCTO_TERMINADO` creado automáticamente + Q20 en sucursal: un producto, variante y artículo (stock cero), un precio vigente.
- En inventariable con artículo existente: no se crea artículo nuevo, se exige tipo `PRODUCTO_TERMINADO` y dimensión `UNIDAD`.
- Sin permiso de inventario o precio, rechazar íntegramente sin registros parciales.
- Sin receta VENTA publicada, foto confirmada o ruta/ubicación cocina: readiness incompleto y commit menú responde 409 sin despublicar.
- Dos sesiones: `expectedVersion` optimista evita pisar cambios.
- Para preparados no crear artículo terminado ni descontar stock directo; los ingredientes se consumirán conforme receta.
- Probar flujo en sucursal con moneda/precios configurados, salida de POS y recibo.

## Arranque local
```powershell
git status
git fetch origin
git switch -c feat/catalog-r2-atomic-setup-readiness-20261105 --track origin/feat/catalog-r2-atomic-setup-readiness-20261105
npm run start:dev
```
Si existe rama local, `git switch feat/catalog-r2-atomic-setup-readiness-20261105` y `git pull --ff-only`.

**main sigue intacto.** Mantener PR draft hasta validación.
