# InventoryModule — Checkpoint INV-A

**Estado:** maestros, catálogo de artículos, selectores enriquecidos y reporte de maestros.
No es un motor de stock todavía. Siguiente: CAT-A, INV-B (Kardex/existencias/costeo),
REC-A, INV-C (conteos/ajustes/mermas/reportes monetarios) según dependencias.

## Tablas propias utilizadas
- `UnidadMedida`, `ConversionUnidad`
- `ArticuloInventario`, `ArticuloInventarioMedia`
- `Almacen`, `UbicacionAlmacen`
- Lectura de referencias relacionadas: recetas, variantes, modificaciones,
  presentaciones de compra, movimientos, conteos, lotes y existencias.

Este checkpoint no registra ni modifica existencias, capas de costo, lotes,
movimientos o saldos. Los resultados de reportería monetaria y existencias
se marcan explícitamente `null` hasta INV-B; jamás se inventan saldos.

## Migración
`prisma/migrations/20261015191500_inventory_checkpoint_a_constraints/migration.sql`
instala restricciones de unidad base única por dimensión, factor de conversión
positivo, lotes obligatorios ante vencimiento, importes no negativos y una
sola ubicación activa de recepción por almacén.

**Antes de aplicar:** revisar unidades base duplicadas, conversiones inválidas,
artículos incompatibles y varias ubicaciones de recepción activas.
PostgreSQL rechazará la migración si ya existen registros que infringen
estas invariantes. No borrar ni corregir automáticamente información
de producción.

```bash
npm run prisma:status
npm run prisma:validate
npm run build
npm test
npm run test:e2e
npm run prisma:deploy
npm run prisma:seed
```

El seed agrega:
- `inventory.units.manage`
- `inventory.articles.manage`
- `inventory.warehouses.manage`
- `inventory.reports.read`
- `inventory.costs.read`
- `inventory.costs.manage`

Todos para el SUPER_ADMIN global, sin tocar credenciales.
Se conservan los permisos antiguos `inventory.read`, `inventory.adjust`,
`inventory.transfer` para compatibilidad.

## Endpoints (prefijo global `/api`)
| Método | Ruta | Función |
|---|---|---|
| GET | /inventory/units | Listado paginado |
| GET | /inventory/units/options | Selector con dimensión opcional |
| GET | /inventory/units/:id | Ficha de unidad |
| POST | /inventory/units | Crear unidad |
| PATCH | /inventory/units/:id | Renombrar sin cambiar dimensión/base |
| GET | /inventory/conversions | Conversiones paginadas |
| POST | /inventory/conversions | Añadir factor decimal |
| POST | /inventory/conversions/preview | Calcular equivalencias por grafo |
| GET | /inventory/articles | Artículos paginados y filtrados |
| GET | /inventory/articles/options | Selector para recetas y otras UIs |
| GET | /inventory/articles/:id | Ficha con unidad e imágenes |
| GET | /inventory/articles/:id/dependencies | Relaciones con recetas, variantes, compras y empaques |
| POST | /inventory/articles | Crear artículo global |
| PATCH | /inventory/articles/:id | Editar controles y costo de referencia |
| PATCH | /inventory/articles/:id/status | Activar/desactivar (motivo) |
| PUT | /inventory/articles/:id/media | Reemplazar imágenes ordenadas |
| GET | /inventory/warehouses | Listado paginado por sucursal |
| GET | /inventory/warehouses/options | Selector por sucursal |
| GET | /inventory/warehouses/:id | Almacén y cantidad de ubicaciones |
| POST | /inventory/warehouses | Registrar almacén |
| PATCH | /inventory/warehouses/:id | Renombrar |
| PATCH | /inventory/warehouses/:id/status | Activación/desactivación |
| GET | /inventory/locations | Ubicaciones por almacén y sucursal |
| GET | /inventory/locations/options | Selector de ubicaciones elegibles |
| GET | /inventory/locations/:id | Ficha enriquecida con dependencias |
| POST | /inventory/locations | Crear ubicación |
| PATCH | /inventory/locations/:id | Editar nombre y recepción |
| PATCH | /inventory/locations/:id/status | Activación/desactivación |
| GET | /inventory/reports/masters | Conteos por tipo, estado y sucursal |

La API responde `{data,meta:{page,limit,total,totalPages}}` en listados,
`{data,meta:{hasMore,nextCursor}}` en selectores; los costos sensibles se
omiten por completo de los resultados sin `inventory.costs.read`.

## Ejemplos de Postman

Crear gramo como base de la dimensión masa:

```http
POST /api/inventory/units
Authorization: Bearer <token>
Content-Type: application/json

{"codigo":"G","nombre":"Gramo","dimension":"MASA","esBase":true}
```

Registrar un ingrediente:

```http
POST /api/inventory/articles
Authorization: Bearer <token>
Content-Type: application/json

{"codigo":"CAFE-001","nombre":"Café","tipo":"INGREDIENTE",
 "unidadBaseId":"<unit-id>","requiereLote":true,
 "requiereVencimiento":true,"stockMinimo":"500.000000"}
```

Crear almacén:

```http
POST /api/inventory/warehouses
Authorization: Bearer <token>
Content-Type: application/json

{"sucursalId":"<branch-id>","codigo":"BOD-01","nombre":"Bodega central"}
```

Crear ubicación:

```http
POST /api/inventory/locations
Authorization: Bearer <token>
Content-Type: application/json

{"almacenId":"<warehouse-id>","codigo":"REC-01","nombre":"Recepción",
 "esRecepcion":true}
```

Administrar imágenes: subir a `POST /api/media/upload` con
`contexto=INVENTARIO`, `sucursalId` omitido y una imagen confirmada,
luego `PUT /api/inventory/articles/:id/media`:
`{"mediaIds":["<media-id>"]}`.
La primera imagen es principal. Imágenes privadas reciben URL firmada
por cinco minutos; otras UIs no necesitan acceder directamente a Spaces.

## Reglas de seguridad
- Maestros globales de artículos y unidades: requiere permisos de escritura globales.
- Almacenes y ubicaciones: permiso por sucursal, validado en aplicación
  y de nuevo dentro de la transacción Prisma.
- Costos: `inventory.costs.read` para visualizar y `inventory.costs.manage`
  para cambiar el costo de referencia.
- No puede desactivarse un artículo con stock o dependencias operativas,
  ni un almacén/ubicación con stock o procesos pendientes.
- No se puede cambiar el código, la unidad base o el tipo de un artículo
  ya creado; no se modifican unidades o conversiones históricas in-place.
- Las conversiones se almacenan como Decimal(24,10), permitiendo factores
  inversos y rutas encadenadas; los factores no pueden formar contradicciones.
- Todas las escrituras generan `EventoAuditoria`.

## Reportería inicial
`GET /api/inventory/reports/masters?sucursalId=<id>` permite ver:
artículos por tipo (global), unidades, conversiones, artículos con fotos,
almacenes/ubicaciones activos por sucursal y ubicaciones de recepción.

No reporta importes de valorización, consumo o disponibilidad: requerirían
INV-B y vínculos transaccionales. INV-C añadirá conteos, ajustes y mermas.

## Próximo módulo
`CatalogModule` usará `InventoryRepositoryPort`/consultas públicas o
puertos estrechos extraídos durante CAT-A para consultar artículos vinculados
a variantes y unidades válidas, sin modificar directamente el stock.
