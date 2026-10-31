# Gastro Core — REP-A R3: dimensiones de venta y conciliación reforzada

Fecha: 2026-10-30. Rama `feat/rep-a-reporting`; PR #18 **DRAFT**, sin merge. Base en `main` `a276c2da1fe7441cf15a07832ee8494847ee2622`.

## Continuidad desde R2

R2 confirmó mediante respuestas del usuario tres ingresos de caja de Q22 (Q66 total) para el turno `cmvv3hupg0009fov4ji0uaci8`. Las tres fuentes eran liquidaciones de repartidor CERRADA; no eran movimientos directamente asociados a Pago y no deben sumarse otra vez como ventas. En R2 se implementaron las líneas profundas `fuente.lineas` con `pagoId`, `cuentaId`, `entregaId`, `ordenId` y monto. Su conciliación real contra DEV sigue pendiente.

## Cambio R3 implementado

- El origen `SALES_LINES` de `GET /api/reports/analytics/sources/:source` añade las agrupaciones `porVariante` y `porModalidad`, junto a `porProducto` y `porCategoria`.
- `porVariante` agrupa por ID de VarianteProducto, enlaza Producto y suma cantidades, `VentaLinea.subtotal` y `VentaLinea.descuento`. Los nombres son actuales del catálogo; los importes proceden de VentaLinea histórica.
- `porModalidad` utiliza el valor `Orden.modalidad` unido por `Venta.cuentaId → Cuenta.ordenId`. Sus valores son MESA/MOSTRADOR/PARA_LLEVAR/DELIVERY; **no equivale a canal externo ni a medio de pago**.
- Los cuatro agrupamientos representan perspectivas alternativas de las mismas VentaLinea. Cada suma individual debe igualar `totales.importeLineas` y `totales.descuentos` del período completo; jamás sumar porProducto+porCategoria+porVariante+porModalidad.
- Las consultas filtran sucursal y el intervalo operativo en `Venta.cerradaEn`, se ejecutan bajo la transacción `REPEATABLE READ` existente y no dependen de `page/limit`.
- No se añaden tablas, migraciones, endpoints nuevos ni propiedades `note`/`definition`/`definitions`/`definicion`. No se altera pagos, caja, stock, liquidaciones ni ventas.

## QA y commits

- Cambio de almacén de reportes: `c5c2ded8c2a7a79ccae6d5482e88621ab804791b`.
- Prueba unitaria de conciliación de 4 agrupaciones con importes y descuentos exactos (Prisma.Decimal): `4f06bea9c013f5ae81ed3cd43feabf11ce5c16f9`.
- Colección Postman transversal ampliada para verificar `porVariante` y `porModalidad`: `3201a1c3c9c9dcf01d8499e1a973318c15ffac73`.
- Catálogo de fuentes actualizado: `10f74222f3899cc925d6b60a15dece27271dc55b`.
- CI sobre `10f74222f3899cc925d6b60a15dece27271dc55b`: **SUCCESS**, [workflow 41134918254](https://github.com/CardonaSantos/new-project/actions/runs/41134918254), jobs verify y migration-smoke aprobados.
- Colección Postman inicial reforzada para liquidación→líneas de Pago y entrega→caja: compara suma de `fuente.lineas[].monto` con `fuente.totalEsperado`, movimiento con `fuente.totalEntregado`, IDs presentes y sin duplicar `pagoId`: `7d6847ed9333d767f289234e2dbf90f15abeaff9`. **No ejecutada todavía en PostgreSQL DEV.**

## Gate de aceptación que continúa abierto

1. Ejecutar [Postman inicial (13 solicitudes)](../rep-a/Gastro_Core_REP_1_INITIAL_DEV.postman_collection.json) con `REP_CASH_SHIFT_ID` del turno DEV e inspeccionar vínculos de cada liquidación. Ejecutar [Postman transversal (9 solicitudes)](../rep-a/Gastro_Core_REP_1_TRANSVERSAL_DEV.postman_collection.json) y conciliar productos, categorías, variantes y modalidades contra `VentaLinea` y órdenes reales.
2. Validar con un usuario de permisos reducidos y otra sucursal, así como `page=1&limit=1` contra agregados del mismo período.
3. Completar REP-1: costo histórico de consumo por `ConsumoOrdenLinea`, márgenes solo con cobertura de costos verificable, cobros y devoluciones, gastos/comisiones y proveedores, conciliación bancaria, inventario/valoración y multi-sucursal con permisos; plan de índices/rendimiento.
4. Implementar REP-2 XLSX/CSV/PDF con archivos reales, datos fuente, fórmulas y controles de inyección/PII; comparar totales contra el mismo snapshot.
5. No fusionar PR #18 ni etiquetar REP-A cerrado antes de la aceptación DEV y de REP-2.

Las pruebas CI demuestran contratos/build y smoke de migraciones; **no validan totales contables independientes sobre los datos DEV**.
