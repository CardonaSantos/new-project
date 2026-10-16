# REC-A — Recetas versionadas y producción

## Principio de operación
El servidor hace el trabajo repetitivo. La UI puede guardar una receta
**con ingredientes y primera versión publicada en una petición**, y ejecutar
una producción completa con **una petición**. También existe flujo en
borrador/confirmar para operaciones que requieren revisión, sin hacerlo
obligatorio para el usuario habitual.

Una receta es una definición; guardarla o previsualizarla no consume stock.
La producción contabilizada sí transforma existencias de INV-B de modo
**atómico e idempotente** (salidas, consumo documentado, lote resultado,
entrada de inventario, costo exacto y auditoría en una transacción serializable).

## Dependencias y propiedad de datos
- CAT-A conserva productos, variantes, modificadores, precios y menús.
- INV-A conserva artículos y unidades; REC-A transforma receta a unidad base.
- INV-B es el único motor de movimientos, saldos, lotes y costos.
- REC-A es dueño de Receta, RecetaVersion, RecetaComponente,
  ModificadorComponente, ReglaEmpaque, ProduccionLote y ProduccionConsumo.
- La integración de ComandaLinea → ConsumoOrden/ConsumoOrdenLinea corresponde
  a Cocina/Órdenes. REC-A **no** se descuenta al cobrar ni al crear una orden.
- Los futuros pagos (tarjeta con terminal externa, transferencia, etc.)
  pueden registrar monto, banco/referencia/autorización y validación manual
  cuando corresponda. **No exigir pasarela interna** ni mezclar Pago con recetas.

## API (prefijo global /api)
- GET/POST /recipes — listado paginado/alta, con version opcional
- GET /recipes/options — opciones enriquecidas
- GET/PATCH /recipes/:id — detalle y estado
- POST /recipes/:id/versions — crear nueva version completa
- PUT /recipes/versions/:id — reemplazar fórmula SOLO en borrador
- POST /recipes/versions/:id/publish — publicar/inactivar versión anterior
- GET /recipes/versions/:id/preview?sucursalId=...&ubicacionId=...&cantidad=...
- GET /recipes/modifiers/:id/components
- PUT /recipes/modifiers/:id/components — composición de extras
- GET/POST /recipes/packaging — reglas de empaque
- GET /recipes/reports/coverage — cobertura de recetas
- GET/POST /production/batches — paginado y alta en borrador
- POST /production/batches/execute — flujo rápido atómico
- GET /production/batches/:id — detalle, lotes, costo y movimientos
- POST /production/batches/:id/confirm — contabilización de borrador
- POST /production/batches/:id/cancel — cancelación SOLO de borrador
- GET /production/batches/reports/summary?sucursalId=...

### Ejemplo RECETA VENTA
Use una variante PREPARADO activa, artículo INGREDIENTE, unidad UNIDAD de
rendimiento y una unidad compatible con el ingrediente:

POST /api/recipes:
{"nombre":"Capuchino mediano","tipo":"VENTA","varianteId":"<variante>",
 "version":{"rendimiento":"1.000000","unidadRendimientoId":"<UNIDAD>",
 "componentes":[{"articuloId":"<leche>","unidadId":"<ML>",
 "cantidad":"150.000000","mermaPorcentaje":"0"}],"publicar":true}}

### Ejemplo PRODUCCION de jarabe (un clic)
Defina antes una receta PRODUCCION con articuloResultadoId PREPARACION,
rendimiento/unidad de la misma dimensión, e ingredientes. Luego:
POST /api/production/batches/execute:
{"recetaVersionId":"<version-publicada>","ubicacionDestinoId":"<ubicacion>",
 "ubicacionConsumoId":"<ubicacion-de-insumos>",
 "cantidadProducida":"1000.000000","claveOperacion":"PROD:JARABE:001"}

cantidadProducida está expresada en la UNIDAD BASE del artículo resultado.
El servidor calcula el factor respecto al rendimiento de receta, expande
mermas previstas como porcentaje de pérdida, convierte a unidades base,
toma lotes elegibles FEFO dentro de la ubicación indicada y devuelve
la producción con movimientos, sin pedir selección manual de cada lote.
Para excepciones, origenes puede indicar ubicacionId y opcional loteId
por artículo. Si falta stock, está bloqueado o vencido: 409 y
**ningún movimiento**. No se usa stock de otras sucursales.
Si el producto requiere lote, el lote resultado se crea automáticamente.
Si requiere vencimiento, indicar fechaVencimiento o vidaUtilDias en la versión.
Las versiones publicadas y producciones confirmadas son inmutables.

## Permisos
- recipes.read — lectura de fórmulas
- recipes.manage — creación/edición GLOBAL
- recipes.publish — publicación GLOBAL
- recipes.production.read — lectura de documentos por sucursal
- recipes.produce — confirmar producciones por sucursal
- inventory.costs.read — consultar importes contables por sucursal

El seed asigna al SUPER_ADMIN global; no altera otros roles. La autorización
de movimiento se vuelve a revisar dentro de la transacción de INV-B.
**La API nunca acepta costo de ingredientes ni costo de salida ingresado por cliente.**

## Precisión y límites
Los decimales son strings; jamás float JS. La valoración proviene del
importe efectivo registrado por INV-B, no de unitarios ya redondeados.
FIFO financiero es independiente de FEFO físico. Producción multinivel
automática no está incluida: las preparaciones intermedias deben existir
como inventario para poder consumirse.

Empaques y modificadores pueden definirse en REC-A; el consumo automático
por ComandaLinea llegará con Cocina/Órdenes, no se simula con pagos ni
comandas ficticias. La confirmación de producción es todo-o-nada.

## Migración
prisma/migrations/20261016120000_recipes_production_v1/migration.sql
adiciona campos a documentos, índices y checks de fórmulas/versiones.
**Antes de deploy**, verificar recetas y datos históricos contra checks:
la migración no elimina ni modifica registros existentes para forzarla.

npm run prisma:validate
npm run build
npm test
npm run test:e2e
npm run prisma:status
npm run prisma:deploy
npm run prisma:seed

CI no ejecuta operaciones en PostgreSQL del usuario. Antes de declarar
REC-A validado en producción, comprobar en Swagger el flujo completo y
la conciliación de existencias/costos.
