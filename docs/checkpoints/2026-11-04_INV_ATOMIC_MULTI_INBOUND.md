# Gastro Core INV — Entrada directa por lote (2026-11-04)

## Contrato
`POST /api/inventory/operations/inbound/batch`
```json
{
  "claveOperacion":"INV-ENTRY-20261104-001",
  "motivo":"Compra de insumos",
  "lineas":[
    {"articuloId":"art-leche","ubicacionId":"barra","cantidad":"12","costoUnitario":"8.50"},
    {"articuloId":"art-cafe","ubicacionId":"barra","loteId":"lote-cafe","cantidad":"5","costoUnitario":"48.75"}
  ]
}
```

Respuesta 201: `{claveOperacion,sucursalId,numeroLineas,movimientos:[...movement result]}`.

## Invariantes
- Una transacción SERIALIZABLE de InventoryPostingEngine. Se contabilizan TODOS los movimientos o NINGUNO.
- De 1 a 25 líneas por llamada, cantidad positiva, costo no negativo, decimal válido de 6 posiciones.
- Cada línea se contabiliza con `AJUSTE_ENTRADA` (no `COMPRA`, porque no es una recepción de proveedor).
- Las ubicaciones deben pertenecer a la **misma sucursal** y estar activas.
- Para cada ubicación: `inventory.costs.manage` y por cada movimiento: `inventory.adjust`, además de control de artículo/lote/costo.
- Clave idempotente única para el lote completo; mismo cuerpo/clave retorna resultado original, cuerpo diferente con la misma clave rechaza 409.
- Cada movimiento tiene clave derivada distinta (`IB-<sha256...>`), referenciaTipo `INVENTORY_INBOUND_BATCH` y referenciaId la clave del lote original.
- Se mantiene auditoría por línea, costo promedio/FIFO, lotes y existencias, mediante `InventoryPostingEngine.post`.
- Sin Prisma schema ni migraciones.
- No modifica `POST /api/inventory/operations/inbound` previo.
- La recepción de proveedor en PUR-A es un flujo **independiente**, con confirmación propia.

## QA
- `test/inventory-operations.e2e-spec.ts`: DTO HTTP, tamaño y cifras.
- `src/modules/inventory/infrastructure/prisma/inventory-batch-inbound.spec.ts`: commit único, clave derivada, reenvío sin duplicados, payload cambiado 409, error en línea posterior rollback total y cruce de sucursales.
- CI NestJS/prisma HTTP/test: comprobar HEAD de PR #28.
- Pendiente prueba manual de integración con PostgreSQL y tres insumos reales/una línea inválida.

## Despliegue
Rama backend: `feat/inventory-batch-inbound-20261104` PR #28.
Rama UI: `feat/purchases-supply-ui-20261104` PR #25.
**Necesario actualizar las dos ramas** para probar el botón de entrada múltiple.
No fusionar sin QA de stock y Kardex.
