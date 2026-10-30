# Gastro Core · REP-1 — Catálogo transversal de fuentes y contrato UI/Excel
Fecha: 2026-10-30 · Rama `feat/rep-a-reporting` · PR #18 **DRAFT**.

## Decisión de contrato

Los JSON de consulta se consumen directamente en Angular: contienen únicamente propiedades funcionales (`source`, `sucursal`, `currency`, `periodo`, `generatedAt`, `totales`, `data`, `meta`). **No** incluir comentarios narrativos tales como `note`, `definicion`, `definition`, `definitions` en ninguna respuesta. Todas las reglas contables quedan documentadas en el dominio y en este catálogo, no en la UI.

La respuesta de cada familia contiene **filas originales y referencias**, no solo KPI. La posterior exportación Excel reutilizará los mismos modelos de evidencia, con hojas por fuente, identificadores de origen, importes numéricos, fórmulas de conciliación y un único snapshot PostgreSQL. **REP-2 todavía no está implementado.**

## Cobertura inicial

`GET /api/reports/analytics/sources/:source?sucursalId=<id>&periodo=DIA|SEMANA|MES|PERSONALIZADO&fecha=AAAA-MM-DD&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&page=1&limit=20`

Todos los períodos se interpretan como fecha **operativa** en America/Guatemala, respetando la hora de corte 04:00 o la configuración existente. Rango máximo: 366 días. Paginación máxima: 100 filas por página. Todas las sumas y agrupaciones son del período **completo**, nunca solamente de la página.

| source | Origen de cada fila | Fecha que agrupa | Medida agregada | Permiso adicional a reports.read |
| --- | --- | --- | --- | --- |
| `SALES_LINES` | VentaLinea → Venta → Cuenta → Orden → OrdenLinea → Variante/Producto | Venta.cerradaEn | Subtotal/descuentos/unidades de líneas, *no* suma independiente del total de venta sin conciliación | sales.read |
| `INVENTORY_MOVEMENTS` | MovimientoInventario → Articulo/Ubicacion/Almacen; referenciaTipo/referenciaId | MovimientoInventario.creadoEn | Costo registrado **por tipo de movimiento**, no margen ni gasto de caja | inventory.reports.read |
| `PURCHASE_INVOICES` | FacturaProveedor → Proveedor | FacturaProveedor.creadaEn | Documento total/subtotal/impuestos **por estado actual**, incluyendo borradores; no significa pago ni consumo | purchases.read |
| `PURCHASE_RECEIPT_LINES` | RecepcionCompraLinea → RecepcionCompra CONFIRMADO → Proveedor/OrdenCompra; movimientoId | RecepcionCompra.recibidoEn | Costo contabilizado en líneas recepcionadas confirmadas y sus impuestos, separado de factura/pago | purchases.read |
| `DELIVERY_EVENTS` | EntregaEvento → Entrega/Orden/Repartidor/Actor | EntregaEvento.creadoEn | Cantidad de eventos por acción y estado resultante; no se interpreta como ingresos | delivery.read |
| `RESERVATION_EVENTS` | EventoReserva → Reserva/Actor | EventoReserva.creadoEn | Eventos auditados por acción; el estado de la reserva vinculado es el **actual** | reservations.read |
| `SUPPLY_REQUESTS` | Requisicion → AlmacenDestino/Solicitante/Lineas | Requisicion.creadaEn | Requisiciones por **estado actual**, líneas solicitadas y atendidas; no es consumo | supply.read |
| `SUPPLY_TRANSFERS` | TransferenciaInventario → almacenes origen/destino/usuario/líneas | TransferenciaInventario.despachadaEn del almacén **origen** | Despachos por estado actual, cantidades enviadas/recibidas y costo en tránsito, no ventas | supply.read |

Para `SUPPLY_TRANSFERS`, la sede de origen autoriza el registro; los reportes de **recepciones** desde la perspectiva de destino deben filtrarse por destino y `recibidaEn` mediante una consulta adicional, no inferirlos de los despachos.

Las fechas de eventos históricos se apoyan en tablas de eventos, evitando interpretar un estado actual como estado de ese día. Para inventario el costo histórico es el registrado por MovimientoInventario; una transferencia entra y sale, nunca debe tratarse como nueva venta/compra.

## Caso de caja DEV corroborado por usuario

`GET /api/reports/analytics/cash-shifts/cmvv3hupg0009fov4ji0uaci8/evidence` devolvió **3 movimientos de ingreso de Q22 = Q66** con `fuente.tipo=LIQUIDACION_REPARTIDOR`, cada uno enlazado a una liquidación `CERRADA`, un actor, fecha, esperado Q22 y entregado Q22. **No son tres movimientos directos con Pago.id**. Por ello se extendió `fuente.lineas` para recuperar desde cada LiquidacionRepartidorLinea → Pago original → Cuenta, Entrega, Orden. Validar los nuevos `lineas` en DEV con la colección Postman antes de afirmar la conciliación del dinero con cobros de delivery.

## Aceptación pendiente

- Repetir las 13 llamadas Postman previas usando nueva rama y confirmar ausencia de campos narrativos.
- Ejecutar [colección transversal](Gastro_Core_REP_1_TRANSVERSAL_DEV.postman_collection.json) (nueve solicitudes; ocho dominios más 400 de origen desconocido), verificar filas y cifras contra las páginas fuente reales de DEV.
- Aislamiento de rol/otras sucursales en PostgreSQL DEV. CI sólo verifica contratos y esquemas.
- Completar análisis de costos de receta/consumo, productos por categoría y variante, cliente, delivery cobranzas/comisiones y bancos, consolidación de múltiples sucursales, cierres, devoluciones/proveedor, stock actual y margen real.
- Implementar REP-2 con XLSX de fórmulas, CSV y PDF, exportación sin truncamiento, metadata de períodos y cobertura por fuente; comparar cada export con su snapshot de datos originales.
- No fusionar PR #18 antes de REP-1 y REP-2 completos y probados.
