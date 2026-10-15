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


## INV-B — Operaciones y valorización (2026-10)

Este checkpoint extiende INV-A con stock, lotes, Kardex, entradas y salidas manuales,
mermas, conteos físicos, transferencias con tránsito, promedio ponderado/FIFO y reportes.
Las órdenes, recepciones de compras y consumo de recetas quedan en sus módulos futuros.

### Migración y precauciones

`prisma/migrations/20261015201500_inventory_operational_engine/migration.sql` añade índices
para posiciones sin lote, invariantes de cantidades y columnas de costos en tránsito.
Verificar que no existan saldos negativos, capas inválidas o posiciones sin lote duplicadas
antes de ejecutar `npx prisma migrate deploy`. No hay borrado automático de registros.

### Rutas (prefijo global /api)

- GET /inventory/stock?sucursalId=<id> — posiciones reales paginadas
- GET /inventory/stock/summary?sucursalId=<id> — consolidado por artículo
- POST /inventory/lots — lote global de un artículo que utiliza lotes
- GET /inventory/lots?sucursalId=<id> — lotes con existencias en la sucursal
- PATCH /inventory/lots/:id/block — cuarentena global por lote
- POST /inventory/operations/opening, /inbound, /outbound, /waste — contabilización manual
- GET /inventory/movements?sucursalId=<id>, /inventory/movements/:id — Kardex y detalle
- POST /inventory/counts, POST /inventory/counts/:id/confirm, GET /inventory/counts/:id
- POST /inventory/transfers, POST /inventory/transfers/:id/dispatch, /:id/receive, GET /:id
- GET /inventory/reports/valuation?sucursalId=<id>
- GET /inventory/reports/expiry?sucursalId=<id>
- GET /inventory/reports/reconciliation?sucursalId=<id>

### Reglas operativas

Las cantidades y costos de entrada son cadenas decimal (hasta seis posiciones).
Las salidas no aceptan costo suministrado por cliente; el motor aplica PROMEDIO_PONDERADO
o FIFO según la empresa. Incluso con el flag de stock negativo activo, se rechazan
saldos negativos: requieren una política de valoración excepcional aún no modelada.

Todos los movimientos son inmutables y usan claveOperacion única; la API manual registra
idempotencia asociada al usuario y cuerpo de la petición. El cambio de costo y saldo, las
capas FIFO, las aplicaciones a capas y la auditoría se realizan en transacción serializable.
Las referencias de movimientos manuales usan la claveOperacion como referencia documental.
Las transferencias son BORRADOR -> EN_TRANSITO -> RECIBIDA; el despacho guarda cantidades
y capas valorizadas en tránsito. La recepción actual es TOTAL; diferencias parciales
requieren un flujo formal de discrepancia aún por integrar con abastecimiento interno.
La recepción crea una capa por tramo de costo para preservar la trazabilidad FIFO.

Los conteos capturan saldos teóricos al crear el documento. Confirmar valida que dichos
saldos no hayan cambiado, genera un ajuste confirmado y movimientos de diferencia.
No se sobrescriben saldos concurrentemente. Para ajustar al alza es obligatorio
costoUnitarioEntrada, con permiso inventory.costs.manage.

Los usuarios con inventory.read pueden ver cantidades y lotes; los costos se omiten
si no tienen inventory.costs.read. Reportes monetarios requieren inventory.reports.read
y inventory.costs.read. Los saldos y el Kardex no interpretan reservas de órdenes.

### Prueba manual Swagger de ejemplo

1. POST /inventory/lots con
`{"articuloId":"<leche-id>","codigoLote":"PRUEBA-001","fechaVencimiento":"2026-11-30"}`.
2. POST /inventory/operations/opening con
`{"articuloId":"<leche-id>","ubicacionId":"<refrigeracion-id>","loteId":"<lot-id>","cantidad":"5000.000000","costoUnitario":"0.010000","claveOperacion":"INV:OPEN:TEST001","motivo":"Carga inicial validada"}`.
3. GET /inventory/stock?sucursalId=<branch-id>, luego registrar outbound con otra clave.
4. Consultar /inventory/movements y /inventory/reports/valuation.
5. Ejecutar conteo y transferencia hacia otra ubicación distinta.

No usar documentos reales de compra ni confirmar pagos desde estos endpoints manuales.

### Cierre y cancelación documental

Se permite cancelar conteos y transferencias únicamente en BORRADOR:
`POST /api/inventory/counts/:id/cancel` y
`POST /api/inventory/transfers/:id/cancel`.
Después de despacho/confirmación no se eliminan movimientos ni se
simulan reversas; las discrepancias se resuelven mediante nuevos documentos
justificados y la integración formal de abastecimiento.

Las respuestas de stock aplican valoración por capas cuando la empresa usa FIFO.
En FIFO, el costo promedio de una posición individual no representa valoración,
por lo que las fichas individuales no publican una valoración ficticia.
El resumen y el reporte monetario resuelven el valor desde las capas FIFO.

Limitación deliberada: no existe reserva de stock ni disponibilidad prometida
para órdenes. El motor rechaza negativos incluso si la bandera de sucursal
permiteStockNegativo está activada, porque FIFO/regularización de costos
negativos requeriría reglas adicionales. Transferencias reciben la totalidad
sin aceptar silenciosamente faltantes; las recepciones parciales quedarán para
el módulo de abastecimiento y discrepancias. No gestionar consumidores externos
de movimientos sin su propio documento de negocio.

### Alcance del promedio ponderado

El promedio se calcula por `articuloId + ubicacionId`, agregando todos los
lotes físicos del artículo en la misma ubicación. El ingreso de una nueva
partida recalcula el promedio de todas esas posiciones, sin alterar las
cantidades de los lotes. Las salidas se valorizan con el promedio consolidado
vigente en la ubicación. El método FIFO usa en cambio las capas de costo del
mismo artículo y ubicación, en orden cronológico; las selecciones físicas
de lotes y las financieras de capas son independientes.
