# PUR-A — Compras, proveedores y cuentas por pagar

**Estado:** implementación en PR, compilación/CI y pruebas HTTP por validar en último commit. El módulo es propietario de órdenes, recepciones, facturas, pagos, devoluciones y créditos. No genera FEL ni hace conciliación bancaria automática.

## Alcance y límites
- Macroflujo 18: proveedores, presentaciones comerciales de artículos inventariables y órdenes de compra.
- Macroflujo 19: recepciones, Kardex de compra, facturas proveedor, deuda, anticipos, pagos, devoluciones, notas de crédito y reintegros.
- Todos los tipos de `ArticuloInventario` participan: ingredientes, preparaciones, productos terminados, empaques y suministros. No se requiere variante de venta.
- INV-B es dueño del stock y de los costos FIFO/promedio; PAY-A conserva el libro de caja; PUR-A nunca duplica esos motores.
- Suministros internos: `POST /api/inventory/internal-consumption` descuenta inventario por cantidad real, responsable JWT, destinoUso y motivo; no crea venta ni factura. SUP-A gestionará las requisiciones posteriores.
- Los empaques automáticos de pedidos son responsabilidad de REC-A/ORD-A. Los consumos no vinculados a pedidos deben ser salidas internas explícitas, no un segundo descuento del mismo pedido.

## Endpoints (prefijo global /api, JWT obligatorio)
| Grupo | Métodos y rutas | Objetivo |
|---|---|---|
| Proveedores | GET/POST /purchases/suppliers, GET/PATCH /purchases/suppliers/:id, PATCH /purchases/suppliers/:id/status | Catálogo global con permisos |
| Presentaciones | GET/POST /purchases/presentations, PATCH /purchases/presentations/:id/status | Conversiones y proveedores |
| Órdenes | GET/POST /purchases/orders, GET/PUT /purchases/orders/:id, POST /:id/confirm, /:id/cancel, /:id/close | Documento comercial; sin stock automático |
| Recepciones | GET/POST /purchases/receipts, GET/PUT /purchases/receipts/:id, POST /:id/confirm, /:id/cancel, GET /:id/movements | Entregas parciales, directas o con OC |
| Facturas | GET/POST /purchases/invoices, GET /purchases/invoices/:id, POST /:id/confirm, /:id/cancel | Documentos y saldos |
| Pagos | GET/POST /purchases/payments, GET /purchases/payments/:id, POST /:id/apply, /:id/confirm, /:id/reject | Efectivo y métodos externos |
| Devoluciones | GET/POST /purchases/returns, GET /purchases/returns/:id, POST /:id/confirm, /:id/cancel | Salida física valorizada |
| Créditos | GET/POST /purchases/credits, GET /purchases/credits/:id, POST /:id/confirm, /:id/apply, /:id/cancel | Saldo acreditable al proveedor |
| Reintegros | POST /purchases/refunds, POST /purchases/refunds/:id/confirm, /:id/reject | Devolución de dinero del proveedor |

Las consultas paginadas requieren `sucursalId` para recursos de sede. Maestros globales pueden consultarse con permiso global o con contexto de sucursal autorizado.

## Ejemplos operativos

Crear OC con pajillas (EMPAQUE), detergente (SUMINISTRO) o café (INGREDIENTE):
```json
{
  "proveedorId": "<proveedor-id>",
  "sucursalId": "<sucursal-id>",
  "precioIncluyeImpuesto": true,
  "lineas": [{
    "articuloId": "<articulo-id>",
    "presentacionId": "<presentacion-id>",
    "cantidadCompra": "2.000000",
    "factorAUnidadBase": "1000.000000",
    "precioUnitarioCompra": "112.00",
    "tasaImpuesto": "0.12",
    "impuestoRecuperable": true
  }]
}
```
Crear recepción directa con una unidad rechazada:
```json
{
  "proveedorId": "<proveedor-id>",
  "almacenId": "<almacen-id>",
  "referenciaProveedor": "GUIA-001",
  "precioIncluyeImpuesto": true,
  "lineas": [{
    "articuloId": "<articulo-id>",
    "ubicacionId": "<ubicacion-id>",
    "cantidadCompra": "10.000000",
    "cantidadRechazada": "1.000000",
    "factorAUnidadBase": "1.000000",
    "precioUnitarioCompra": "11.20",
    "tasaImpuesto": "0.12",
    "impuestoRecuperable": true
  }]
}
```
La recepción registra 9 unidades aceptadas; una rechazadas se conserva en `cantidadRechazada`, **no se añade al stock ni al costo capitalizado**. La base e impuesto se calculan del importe aceptado. Si la OC tiene impuesto incluido, la recepción debe usar la misma modalidad/tasa. Un costo tributario recuperable no se capitaliza.

Confirmación de recepción: `POST /api/purchases/receipts/<id>/confirm`
```json
{"claveOperacion":"PUR:RECEIPT:CONFIRM:001"}
```
La confirmación registra movimientos `COMPRA` atómicos con `referenciaTipo=RECEPCION_COMPRA` y suma exacta de costo total de origen. Se rechazan sobre-recepción, lotes incompatibles y órdenes ajenas.

Factura recibida, no FEL emitida:
```json
{
 "proveedorId":"<proveedor-id>","sucursalId":"<sucursal-id>",
 "numeroDocumento":"FACT-001","fechaEmision":"2026-10-16",
 "precioIncluyeImpuesto":false,
 "lineas":[{"descripcion":"Insumos","cantidad":"1.000000",
 "precioUnitario":"100.000000","tasaImpuesto":"0.12"}]
}
```
La factura debe confirmarse antes de recibir aplicaciones. Su detalle devuelve `pagado`, `acreditado` y `saldo`. El asiento de factura por sí mismo **no** aumenta inventario.

Pago externo pendiente (requiere confirmación autorizada):
```json
{
 "claveOperacion":"PUR:PAY:CREATE:001","proveedorId":"<proveedor-id>",
 "sucursalId":"<sucursal-id>","metodo":"TRANSFERENCIA",
 "monto":"112.00","referencia":"BANCO-123",
 "aplicaciones":[{"facturaId":"<factura-confirmada>","monto":"112.00"}]
}
```
La creación deja estado PENDIENTE. `POST /api/purchases/payments/<id>/confirm` con `{"claveOperacion":"PUR:PAY:CONFIRM:001"}` acredita el pago, previo control de saldo incluso ante otra confirmación concurrente. Efectivo exige turno activo y crea `MovimientoCaja` de EGRESO. La parte no aplicada de un pago confirmado puede asignarse posteriormente, como anticipo sin factura previa.

Consumo interno manual de detergente:
```json
{"articuloId":"<suministro-id>","ubicacionId":"<ubicacion-id>",
 "cantidad":"2.000000","destinoUso":"LIMPIEZA",
 "motivo":"Reposición para sanitización de baños",
 "claveOperacion":"INV:INTERNAL:CLEAN:001"}
```

## Permisos y garantías
Permisos diferenciados: `purchases.read`, `purchases.suppliers.manage`, `purchases.presentations.manage`, `purchases.orders.create`, `purchases.orders.approve`, `purchases.receipts.create`, `purchases.receipts.confirm`, `purchases.invoices.manage`, `purchases.invoices.confirm`, `purchases.payments.create`, `purchases.payments.confirm`, `purchases.returns.manage`, `purchases.credits.manage`, `inventory.consume.internal`.

Las mutaciones confirmatorias llevan `claveOperacion`. Reintentos no duplican Kardex, salida de caja ni facturas aplicadas. El motor de inventario y operaciones financieras usa transacciones SERIALIZABLE. El permiso se evalúa sobre la sucursal real del recurso. La base de datos mantiene índices y restricciones monetarias de la migración nueva.

## Migración, pruebas y advertencias
Migración: `prisma/migrations/20261017150000_pur_a_purchase_documents`. Es aditiva pero incorpora estados, restricciones y campos de auditoría. **Revisar documentos históricos y respaldar** antes de desplegar en cualquier ambiente con datos.
```bash
npm run prisma:status
npm run prisma:validate
npm run build
npm test
npm run test:e2e
# Solo después de respaldar DATABASE_URL:
npm run prisma:deploy
npm run prisma:seed
```
CI comprueba contrato compilado y HTTP simulado. **Pendientes de certificación operativa:** pruebas PostgreSQL reales de migración, apertura/cierre de turno, compras parciales concurrentes, impuestos, notas de crédito con aplicaciones múltiples y FIFO/promedio con devoluciones. No confundir CI con una transacción real certificada.

## Control de facturación por recepción y notas de crédito (fix de octubre)
- Las líneas vinculadas a `recepcionLineaId` deben facturarse en **cantidad comercial aceptada** (no cantidad en unidad base). Una confirmación comprueba `SUM(cantidad)` de líneas de facturas `CONFIRMADA` por cada línea de recepción y rechaza el exceso; también agrega líneas repetidas dentro del mismo documento. Las facturas `BORRADOR` no reservan cantidades y las `ANULADA` no consumen cupo. El control se repite en `POST /purchases/invoices/:id/confirm` bajo transacción SERIALIZABLE, de modo que los borradores concurrentes se resuelvan por confirmación. Facturas sin recepción conservan su tratamiento comercial, sin descontar ni generar inventario.
- Las notas de crédito mantienen el campo `total` y admiten opcionalmente `impuestos`. Se calcula `subtotal=total-impuestos`, ambos persistidos. Si se omite `impuestos`, se interpreta **crédito comercial sin ajuste de impuesto**, para conservar compatibilidad con Postman previo. Un impuesto declarado jamás puede igualar o superar el total.
- La migración `20261028181500_pur_a_invoice_receipt_coverage_credit_tax` completa como `subtotal=total` e `impuestos=0` las notas históricas existentes, sin eliminarlas ni modificar pagos/reintegros, y añade la identidad contable `total = subtotal + impuestos`.
- Una nota de crédito es un documento comercial distinto de la factura original; el IVA rectificado se informa por separado. **FIN-A** será responsable de los asientos fiscales consolidados.
