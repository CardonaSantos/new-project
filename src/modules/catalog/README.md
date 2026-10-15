# CAT-A · Catálogo comercial

Módulo NestJS 12 ESM / Prisma 7 implementado para Gastro Core.

## Alcance
CRUD categorías jerárquicas y sus imágenes, productos y variantes,
grupos de modificadores, recargos, precios por sucursal, menús,
secciones, horarios, publicación y reportes de cobertura comercial.
Los artículos físicos vinculados pertenecen a Inventory INV-A.

**No se implementan todavía** movimientos de stock, recetas, órdenes,
ventas, márgenes, inventario utilizable o menú QR anónimo.
La cotización comercial NO promete existencias de ingredientes.

## Migración
Nueva migración: prisma/migrations/20261015194500_catalog_a/migration.sql.
Crea Menu, MenuSucursal, MenuSeccion, MenuItem, MenuHorario,
VarianteSucursal y PrecioModificador; prohíbe superposiciones de
PrecioVariante por variante/sucursal mediante btree_gist.

Antes de migrar revisar precios históricos duplicados o superpuestos.
No alterar el esquema ni limpiar datos productivos para forzar la migración.

## Permisos
catalog.read, catalog.manage (existentes);
catalog.prices.manage, catalog.menus.manage, catalog.reports.read (nuevos).
Seed idempotente asigna al SUPER_ADMIN global.
Precios y pausas se autorizan por sucursal en servicio y transacción.
Catálogo base requiere gestión global.

## Recursos y endpoints (todos con prefijo /api)

Categorías:
- GET /catalog/categories, /catalog/categories/tree, /catalog/categories/options
- GET /catalog/categories/:id
- POST /catalog/categories
- PATCH /catalog/categories/:id
- PATCH /catalog/categories/:id/status
- PUT /catalog/categories/:id/media

Productos y variantes:
- GET /catalog/products, /catalog/products/options, /catalog/products/:id
- POST /catalog/products (variantes anidadas opcionales)
- PATCH /catalog/products/:id y /catalog/products/:id/status
- PUT /catalog/products/:id/media
- GET /catalog/products/:id/readiness (requiere sucursalId)
- POST /catalog/products/:id/variants
- GET /catalog/variants/options y /catalog/variants/:id
- PATCH /catalog/variants/:id y /catalog/variants/:id/branch
- PUT /catalog/variants/:id/media
- PUT /catalog/variants/:id/modifier-groups

Modificadores/precios:
- GET/POST /catalog/modifier-groups
- GET /catalog/modifier-groups/options
- PATCH /catalog/modifier-groups/:id
- GET/POST /catalog/modifiers y PATCH /catalog/modifiers/:id
- POST /catalog/prices/variants
- POST /catalog/prices/modifiers
- GET /catalog/prices/variants/:id/history
- GET /catalog/prices/modifiers/:id/history
- GET /catalog/prices/variants/:id/resolve
- POST /catalog/prices/quote

Menús:
- GET/POST /catalog/menus
- GET/PATCH /catalog/menus/:id
- PUT /catalog/menus/:id/layout
- POST /catalog/menus/:id/publish
- POST /catalog/menus/:id/unpublish
- GET /catalog/menu (requiere sucursalId, autenticación)

Reportes:
- GET /catalog/reports/summary
- GET /catalog/reports/price-coverage (requiere sucursalId)

Swagger UI está en /api/docs.

## Reglas de negocio
Categorías no aceptan ciclos ni padres inactivos.
Variantes INVENTARIABLE requieren artículo INVENT-A activo y
PRODUCTO_TERMINADO. PREPARADO y SERVICIO no enlazan artículo físico
directamente. No se mutan claves y tipos que comprometen historial.

Precios expresados como string Decimal(18,2).
vigenteDesde es inclusivo y vigenteHasta es exclusivo. Crear un precio
posterior cierra la vigencia abierta anterior automáticamente, dentro
de la misma transacción. PostgreSQL rechaza rangos superpuestos.
Los cambios preservan el histórico monetario.

Los menús agrupan secciones y variantes, con sucursales y franjas
por día local (domingo=0). Horarios no cruzan medianoche;
para ello se usan franjas separadas en dos días.
Guardar layout es una operación atómica que requiere expectedVersion,
incrementa la versión y despublica el menú. Publicar comprueba imagen
confirmada, precio vigente, variante/producto activos, política manual
y sucursal habilitada para todos los ítems incluidos.

La consulta de menú solo devuelve ítems comercialmente elegibles
en la fecha y sucursal solicitadas, no valida stock ni recetas.
Las consultas enriquecidas devuelven relaciones, variantes, fotos
y referencias de artículo físico. Para asociar imágenes, primero subir
al MediaModule con contexto PRODUCTO o CATEGORIA y luego enviar mediaIds.

El motor de reportes mide conteos, cobertura y calidad del catálogo.
Ventas y rentabilidad se reportan como null hasta integraciones reales.

## Verificación
1. npm run prisma:validate
2. npm run build
3. npm test
4. npm run test:e2e
5. npx prisma migrate status
6. npx prisma migrate deploy
7. npx prisma db seed
8. npm run start:dev

Pruebas Swagger sugeridas: crear categoría; crear producto PREPARADO
con variante; subir imagen y vincularla; habilitar visibilidad;
registrar precio de variante para PRINCIPAL; crear grupo/modificador,
vincular y cotizar; crear menú, guardar layout usando expectedVersion,
publicar y consultar /api/catalog/menu; revisar reportes.

La CI valida tipos/HTTP simulados, no ejecuta migración en tu PostgreSQL
local. La migración y la prueba funcional de punta a punta siguen
siendo obligatorias antes de producción.
