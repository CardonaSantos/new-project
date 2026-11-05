# Gastro Core — Backend POS / Órdenes / Cocina Express
**Fecha:** 2026-11-05  
**Base:** `main@cad462144bb27488b7dc282d2e121df1509521ae`  
**Rama:** `feat/pos-orders-kitchen-express-20261105`  
**PR:** #30, draft. **No se ha fusionado main.**

## Diseño operativo
- Los productos INVENTARIABLE y SERVICIO no requieren comanda, pero siempre crean una Orden/Cuenta para trazabilidad.
- Los productos PREPARADO conservan el envío a Cocina, modificadores, receta y consumo en preparación.
- Cobrar no equivale a preparar, listo, entregar o cerrar. La venta solo existe al cerrar la cuenta/orden válidamente.
- El servidor es autoridad para precios, descuentos, stock, acceso, pagos, importes, movimientos y estados. UI nunca calcula la cifra definitiva.
- Operaciones de escritura con `claveOperacion` estable; la UI debe usar una clave NUEVA por intención, mantenerla en reintentos sin modificar payload, y no hacer reintentos automáticos de HTTP POST.

## Contratos nuevos
### POST /api/pos/quick-checkout
Venta directa completa **atómica** para MOSTRADOR o PARA_LLEVAR, solo productos INVENTARIABLE o SERVICIO; transferencia no admitida (pendiente de verificación). 
Permisos: `orders.create` + `payments.collect` en sucursal; requiere turno de caja válido del cajero.

```json
{
 "sucursalId":"branch-id", "modalidad":"MOSTRADOR", "origen":"CAJA",
 "lineas":[{"varianteId":"variant-id","cantidad":"1"}],
 "turnoId":"shift-id",
 "pagos":[{"metodo":"EFECTIVO","monto":"7.00","efectivoRecibido":"10.00"}],
 "claveOperacion":"POS:abc123", "enviarCocina":true
}
```
Respuesta:
```json
{"ordenId":"order-id","numero":"ORD-xxx","ventaId":"sale-id",
 "estado":"CERRADA","total":"7.00","pagoIds":["payment-id"]}
```
En `exigeCobroAntesPreparar=true`, el procesamiento del stock se realiza en la MISMA transacción después del cobro. En la configuración normal, el procesamiento sucede durante la creación dentro de esa transacción. Requiere pago confirmado por el total. Si pago/stock falla, todo revierte: no queda Orden ni Pago ni consumo parcial. El comprobante de venta sigue siendo no fiscal.

### POST /api/orders/:id/pay-and-send
Cobra una cuenta principal NO dividida y envía sus líneas pendientes a Cocina después de registrar pagos confirmados, en una transacción. Para la orden propia: `orders.create`; para las ajenas: `orders.manage`. Siempre `payments.collect`. Requiere turno válido. Transferencias pendientes no se aceptan.
```json
{"turnoId":"shift-id","pagos":[{"metodo":"EFECTIVO","monto":"22.00","efectivoRecibido":"25.00"}],
 "claveOperacion":"ORDPAY:abc123"}
```
Respuesta:
```json
{"ordenId":"order-id","estado":"ABIERTA","pagoIds":["payment-id"],"comandasPendientes":1}
```
**ABIERTA pagada** con `comandasPendientes>0` es correcto: después Cocina registra preparación y entrega, y el cierre obedece `PaymentsStore.settleTx`. No cerrar ni liberar mesa al cobrar si hay preparación pendiente. 
Para cuentas divididas, abonos parciales y transferencias pendientes, usar la pantalla PAY-A completa.

### POST /api/kitchen/tickets/:id/ready-deliver
### POST /api/kitchen/lines/:id/ready-deliver
```json
{"claveOperacion":"KDS:abc123"}
```
Permiso: `kitchen.manage` en sucursal real de la comanda. Un solo `InventoryPostingEngine.tx` Serializable; reutiliza `startTx`, `readyLineTx` y `deliverLineTx` (sin transacciones anidadas).
- Ticket: prepara cantidades pendientes, marca LISTA y entrega todas las líneas no canceladas.
- Línea: procesa SOLO la línea indicada.
- En reintentos, no duplica consumos, entregas ni eventos. `deliverLineTx` ya no emite otro evento si la línea fue entregada. Permisos se comprueban incluso con replay.
- Semántica: usar estas acciones únicamente si ya se entregó físicamente. Para «Preparada, esperando mesero» seguir utilizando `/ready` sin marcar entrega.

### GET /api/kitchen/queue
Query: `sucursalId` obligatorio; `estacionId` opcional, `vista` (ACTIVAS | PARA_ENTREGAR | ENTREGADAS | TODAS), `page` default 1, `limit` default 30, máximo 100. Permiso `kitchen.read`.
Respuesta:
```json
{"data":[],"meta":{"page":1,"limit":30,"total":0,"totalPages":0},
 "totals":{"pending":0,"preparing":0,"readyToDeliver":0,"delivered":0}}
```
Los conteos abarcan **toda** la sucursal/estación, no la página actual. Orden global determinista `enviadaEn ASC, id ASC`; la UI no debe reordenar una única página y afirmar que es la prioridad global. Incluye modificadores snapshots existentes.

### GET /api/orders/worklist
Query existente `OrderListDto`: `sucursalId` obligatorio, `estado` opcional (default ABIERTA), `modalidad` opcional, `search` por número, `page` y `limit`; permiso `orders.read`.
Respuesta incluye `data[]`: `id,numero,modalidad,estado,version,abiertaEn,ocupacionMesaId,mesa,total,pagado,saldo,needsProcessing,kitchen:{pending,preparing,toDeliver}` y `meta`.
Importes en **cadenas decimales exactas** para que Angular aplique moneda real de sucursal en la presentación; no duplicar la suma de transacciones en cliente.

## Propuesta de UI a construir sobre estos contratos
1. **POS:** tarjetas de productos compactas, carrito persistente dentro de la vista, acceso directo a cobro; para exclusivamente INVENTARIABLE/SERVICIO usar quick-checkout y mostrar número de venta real, importe, botón de ticket 80 mm y «Nueva venta». Errores se muestran en toast persistente + región `role=alert`; no vaciar carrito ante error.
2. **Mesas/Órdenes:** elegir mesa ocupada carga su orden en el mismo editor, agregar con el actual `POST /api/orders/:id/lines`; barras «Enviar productos» / «Cobrar» contextuales. Worklist reemplaza consultas de detalle por cada tarjeta.
3. **Cobro de preparados:** si se necesita cobrar antes de enviar o se desea una operación de cobro+envío, botón «Cobrar y enviar» usa `pay-and-send`. Distinguir `ABIERTA` pagada con comandas de `CERRADA` en la pantalla.
4. **KDS:** «Marcar lista» permanece diferente de «Lista y entregada». Las acciones combinadas usan endpoint atómico, no un bucle Angular de peticiones. La cola usa totales globales. Modal con toppings y notas; botón grande apto para táctil.
5. **Accesibilidad:** etiquetas claras, `role=status`, foco en éxito/error, sin cambios de pantalla innecesarios, botones cómodos al tacto y teclado F2 o / para búsqueda. Los estados se muestran con texto además de color.

## Riesgos, QA y límites
- Ninguna migración Prisma; ningún cambio a reglas de FIN, PAY, INV, DEL o FEL.
- Serialización del orden + reintentos: no repetir POST de forma silenciosa; misma clave para mismos datos y nueva clave para acción distinta. Error de concurrencia debe permitir revisar estado.
- IVA y facturas FEL: no se generan desde el POS ni se falsifican en un ticket.
- Validar con Postgres real: stock insuficiente, pagos rechazados, caja cerrada, cambio de sucursal, dos cajeros simultáneos, misma clave + payload distinto, comanda preparada dos veces, cancelada, parcialmente lista, entrega duplicada, consumos de receta y efectivo con vuelto.
- Para productos preparados en quick-checkout, responder conflicto de forma intencional: deben usar flujo normal o `pay-and-send`.
- En una sucursal con `exigeCobroAntesPreparar`, `pay-and-send` permite procesar Cocina después de confirmar el pago, sin persistir preferencias ambiguas de envío. La UI elige expresamente la operación.
- El módulo de impresión térmica de Angular continúa separado, sin cambios en SAT.
