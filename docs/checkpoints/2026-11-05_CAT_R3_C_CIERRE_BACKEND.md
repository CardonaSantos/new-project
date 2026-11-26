# Gastro Core — R3-C / Checkpoint backend
**Fecha:** 2026-11-05
**Rama:** `feat/catalog-r3-c-menu-editor-readiness-20261105` — [PR #33](https://github.com/CardonaSantos/new-project/pull/33) (draft, apilado sobre R3-A+B PR #32).
**UI:** [PR #34](https://github.com/CardonaSantos/new-project-angular-ui/pull/34).
**Base:** R3-A+B `9f92974`, que contiene R2 y R1 de backend.
**Migraciones:** ninguna.

## Contratos nuevos / aditivos
1. `POST /api/catalog/menus/:id/validate` + `MenuLayoutDto` existente: valida el **borrador actual en memoria**, antes de persistir, con `expectedVersion`, autorización global `catalog.menus.manage`, sucursales activas, secciones, presentaciones, precios por sucursal, fotografías confirmadas, receta VENTA publicada, ruta/ubicación de Cocina, artículo físico y compatibilidad de extras.
2. Respuesta: `{menuId, versionActual, publicada, lista, problemas[], comprobadas[], totalPresentaciones, totalSucursales}`. Cada problema contextual incluye `codigo, varianteId?, productoId?, nombre?, sucursalId?, seccion?`. `comprobadas[]` añade sucursal y precio, permitiendo diagnóstico y navegación al producto.
3. `GET /api/catalog/products/options?categoriaId=<id>&search=<texto>` admite el filtro opcional **en servidor**: selección múltiple de presentaciones sin cargar un catálogo completo.
4. `POST /api/catalog/menus/:id/commit` de R2 sigue siendo la única operación que reemplaza la distribución y publica de manera **transaccional** tras volver a validar todos los requisitos. `/validate` es informativo, no reserva ni garantiza que el stock siga disponible cuando se venda.

## Invariantes de seguridad
- `validate` es de solo lectura: **no** elimina secciones, modifica la versión, publica, ni registra salida de Inventario.
- El control optimista rechaza una revisión con versión antigua (409). La publicación vuelve a comprobar dentro de su propia transacción, previniendo TOCTOU del borrador.
- La carta publicada permanece sin cambios si la publicación falla por receta, precios, foto, Cocina o permisos.
- La fotografía confirmada sigue siendo requisito duro para publicación en este sprint; **no** se relajaron reglas silenciosamente.
- No se modificaron recetas, snapshots de órdenes, extra SUMAR/RESTAR/SUSTITUIR, pagos, órdenes ni kárdex.
- Límite de complejidad de revisión: 300 combinaciones variante×sucursal por solicitud; entre más, solicitar revisión en lotes / refinar contrato.

## Pruebas
- Unitarias `catalog-setup.service.spec.ts`: preview devuelve producto/sucursal correctos, reporta `SIN_RECETA_PUBLICADA` sin mutaciones y rechaza versión antigua.
- HTTP `catalog.e2e-spec.ts`: DTO válido aceptado; variante con orden negativo rechazada.
- CI: build, test unitarios, HTTP y migración-smoke PostgreSQL (PR #33).

## Aceptación manual pendiente antes de main
1. Carta publicada actual; editar borrador y agregar producto sin precio/receta: preview explica problema y commit deja carta anterior visible.
2. Corregir requisito y guardar+publicar: versiones cambian, proyección POS muestra la nueva carta.
3. Dos sesiones editando: 409 en revisión o publicación, sin pérdida silenciosa.
4. Selección por categoría y búsqueda con muchos productos (>50), búsqueda devuelve resultados filtrados por backend.
5. Verificar separación de permisos y que `validate` no crea movimientos ni cambia versión/publicadoEn.
6. Verificar fotos, horarios, sucursal y stock de recetas e inventariables según los flujos reales.

## Local
```powershell
git fetch origin
git switch -c feat/catalog-r3-c-menu-editor-readiness-20261105 --track origin/feat/catalog-r3-c-menu-editor-readiness-20261105
npm run start:dev
```
Si existe la rama: `git switch feat/catalog-r3-c-menu-editor-readiness-20261105` seguido de `git pull --ff-only`.
**No fusionar** antes de la aceptación PostgreSQL local y el checklist visual de Angular.
