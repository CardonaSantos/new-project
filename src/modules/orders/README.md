# ORD-A — Órdenes, Mesas y Cocina

## Operación
El operador registra una orden y, por defecto, la envía a cocina en la misma petición.
El servidor calcula precios por sucursal (CAT-A), valida extras, abre la ocupación
de mesa, crea la cuenta y envía solo las líneas aún no despachadas. No hay que
crear ocupación, cuenta y comandas manualmente.

La comanda se prepara con la RecetaVersion y el snapshot de ingredientes de sus
modificadores conservados en OrdenLinea, aun si luego se publica otra versión.
REC-A calcula requerimientos y INV-B asigna lotes elegibles por FEFO y contabiliza
movimientos CONSUMO, importes reales y ConsumoOrden en una transacción serializable.
Nunca se descuenta inventario simplemente al crear o cobrar una orden.

## API
- GET /api/orders?sucursalId=... ; GET /api/orders/:id
- POST /api/orders — crear/cotizar/abrir mesa/cuenta/enviar en un paso
- PATCH /api/orders/:id — cambiar cliente y observaciones con versión optimista
- POST /api/orders/:id/lines — añadir productos y enviar solo incrementos
- PATCH /api/orders/:id/lines/:lineId — editar línea sin enviar
- POST /api/orders/:id/lines/:lineId/cancel — cancelar línea sin consumo
- POST /api/orders/:id/send — enviar pendientes
- POST /api/orders/:id/cancel — cancelar y preservar consumo histórico
- POST /api/orders/:id/close — requiere cuenta liquidada y preparación terminada
- GET/POST/PATCH /api/tables/rooms
- GET/POST/PATCH /api/tables ; POST /api/tables/occupancies/:id/close
- GET/POST/PATCH /api/kitchen/stations
- GET/POST/PATCH/DELETE /api/kitchen/routes
- GET /api/kitchen/tickets?sucursalId=... ; GET /api/kitchen/tickets/:id
- POST /api/kitchen/tickets/:id/start — iniciar consumo de toda comanda
- POST /api/kitchen/tickets/:id/ready — preparar pendientes y marcar lista
- POST /api/kitchen/lines/:id/start — preparar cantidad parcial con clave idempotente
- POST /api/kitchen/lines/:id/ready ; POST /api/kitchen/lines/:id/deliver
- GET /api/kitchen/changes?sucursalId=...&cursor=... — polling incremental seguro

## Configuración inicial ejemplo (IDs reales de pruebas anteriores)

POST /api/kitchen/stations:
{"sucursalId":"cmv8p4k3x0001u4v4xor2zgqu","nombre":"Barra",
"ubicacionConsumoId":"cmv9u3ysr000264v4ta591bp3"}

POST /api/kitchen/routes (solo cuando hay varias estaciones):
{"estacionId":"<estacion>","varianteId":"cmv9wfri60005kov4x7zq4yfz",
"prioridad":100}

POST /api/orders:
{"sucursalId":"cmv8p4k3x0001u4v4xor2zgqu","modalidad":"MOSTRADOR",
"lineas":[{"varianteId":"cmv9wfri60005kov4x7zq4yfz",
"cantidad":"1.000","modificadores":[]}],
"enviarCocina":true,"claveOperacion":"ORD:SMOKE:0001"}

Repetir la última solicitud con misma clave y contenido devuelve el mismo pedido.
Para PREPARADO se requiere receta publicada y estación con ubicación de consumo.
Una sola estación activa configurada sirve de ruta por defecto.
Para agregar productos luego, usar POST /api/orders/:id/lines con nueva clave.

## Reglas centrales
- PREPARADO: genera comanda, consume ingredientes cuando empieza preparación.
- INVENTARIABLE: descuento directo FEFO del artículo vinculado al enviar;
  su unidad base debe ser UNIDAD. No crea comanda.
- SERVICIO: no necesita comanda ni movimiento de inventario.
- PENDIENTE, PREPARANDO, LISTA y CANCELADA son los únicos estados de comanda.
- Mark READY puede iniciar y contabilizar lo pendiente si se omitió START.
- Lotes bloqueados/vencidos o stock insuficiente provocan rollback total.
- Intento repetido con igual clave y solicitud no duplica consumos.
- Cancelar preparación consumida NO restaura automáticamente existencias.
- Orden cancelada sin pagos deja Cuenta en cero/cerrada; importes históricos
  se conservan en Orden y auditoría.
- La mesa se libera automáticamente al cerrar/cancelar la última orden abierta.


## Protección adicional — cancelación de preparación y modificadores físicos
- Cancelar una orden SIN preparación conserva la operación habitual: `POST /api/orders/:id/cancel` con `{"motivo":"..."}`.
- Si ya hubo consumo de receta/empaque, unidades preparadas o entrega, se exige el permiso **`orders.cancel.prepared`** (supervisor) además de `orders.manage`, y la petición debe incluir `clasificacion`: `CORTESIA`, `MERMA_OPERATIVA`, `ERROR_OPERATIVO` u `OTRO`.
- Las cancelaciones registran `importeAnulado`, `motivoCancelacion`, `clasificacionCancelacion` y `autorizadaCancelacionPreparada`. Se conserva `Orden.total` original, se cierra la cuenta sin cobrar, y jamás se restaura automáticamente el inventario consumido. Pagos existentes impiden cancelar sin gestión financiera posterior.
- Los modificadores pueden declarar `requiereComposicion: true` mediante `PATCH /api/catalog/modifiers/:id`. Si se seleccionan para venta y no tienen `ModificadorComponente` en REC-A, se rechaza la orden (409). Los modificadores puramente comerciales pueden conservar `false`.
- Configuración física: `PUT /api/recipes/modifiers/:id/components` con `componentes:[{articuloId,unidadId,cantidad,efecto:'SUMAR'}]`. La orden congela la composición por línea y cocina la consume contra inventario real sin cambiar retroactivamente si la receta/modificador se edita luego.
- Tras desplegar ejecutar `npm run prisma:deploy` y `npm run prisma:seed` (nueva migración aditiva `20261017120000_orders_supervised_cancellation_and_modifier_composition`). El seed otorga el permiso de supervisor a `SUPER_ADMIN`; para otros roles asignar explícitamente.

## Pagos, cuentas e integraciones
ORD-A crea Cuenta y CuentaLinea. No escribe pagos ficticios ni obliga
a una pasarela. Pagos/Caja implementará cobros en efectivo, terminal de tarjeta
externa mediante autorización/referencia, transferencia bancaria mediante
referencia/comprobante verificado, pagos mixtos, turnos y liquidaciones.
Cuando ConfiguracionSucursal.exigeCobroAntesPreparar sea true, se permite
crear orden pero no despachar antes del pago real suficiente.

QR/autoservicio, plataformas externas, Delivery, reservas y reportería
reutilizarán el motor ORD-A con políticas de canal específicas.

## Permisos
orders.read, orders.create, orders.manage, orders.discount,
kitchen.read, kitchen.manage, tables.read y tables.manage.
El seed agrega orders.discount al SUPER_ADMIN global.
No se revelan los costos de inventario en respuestas de Órdenes/Cocina.

## Despliegue y pruebas
Migración: prisma/migrations/20261017100000_orders_kitchen_v1/migration.sql
Es incremental, no borra ni reinicia registros. Antes de desplegar,
comprobar que no existan varias OcupacionMesa abiertas (cerradaEn IS NULL)
para una misma mesa; el índice parcial impediría esas duplicaciones.
Respaldar base y revisar prisma:status.

Comandos:
npm run prisma:validate
npm run prisma:deploy
npm run prisma:seed
npm run build
npm test
npm run test:e2e

La CI NO realiza pruebas de integración con la base PostgreSQL del usuario.
Después del deploy validar en Postman: orden/cuentas, envío incremental,
consumo de 150 ml de leche para un capuchino, reintentos, stock,
Kardex, reconciliación, bloqueo por falta de stock y política de prepago.


## Arquitectura hexagonal — refactor de mantenimiento
- `domain/`: políticas puras de órdenes, cocina y mesas existentes.
- `application/ports/`: contratos específicos `OrderPort`, `KitchenPort`, `TablePort`.
- `application/`: casos de uso públicos para controladores NestJS.
- `infrastructure/prisma/`: stores y lógica transaccional existente, sin cambios funcionales.
- `presentation/http/`: rutas y DTOs existentes, sin acceso directo a Prisma.
- Dependencias intermodulares anteriores permanecen exportadas hasta migrar los consumidores mediante PRs específicos.
