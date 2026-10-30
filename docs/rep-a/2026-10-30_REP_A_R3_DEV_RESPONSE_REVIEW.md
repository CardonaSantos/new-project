# Gastro Core — REP-A R3, revisión parcial de respuestas PostgreSQL DEV

Fecha: 2026-10-30. PR #18 DRAFT, rama `feat/rep-a-reporting`. Evidencia: respuestas HTTP incluidas en archivo compartido por el usuario el 30/10/2026; **no se accedió directamente a la base DEV**.

## Alcance de la evidencia entregada

- Colección inicial: **10 respuestas recibidas** de 13 solicitudes. Recibidas dashboard 00, overview 01–04, tickets 05, pagos 06, gastos 07, evidencia de caja 09 (etiquetada 8 en el archivo) y sin sucursal 12 (400 previsto). **Faltan** 08 turnos de caja, 10 evidencia de cobros individuales y 11 evidencia de gastos individuales.
- Colección transversal: **9 respuestas de 9 solicitudes**: siete respuestas 200 de fuentes, un 403 no esperado en 05 `RESERVATION_EVENTS` y un 400 esperado en 08 origen inexistente.
- **Resultado del corte**: 18/22 solicitudes satisfactorias (incluyendo dos 400 esperados), tres sin respuesta compartida, una no satisfecha por falta del permiso `reservations.read`. No equivale a la ejecución automatizada completa ni a una auditoría SQL independiente.

## Conciliaciones manuales comprobadas a partir de JSON aportados

- DIA (2026-10-30): ventas Q22.00, cobros Q88.00, sin gastos; pagos por método EFECTIVO Q66.00 (tres) + OTRO Q22.00 (uno). El hecho de que la venta y los pagos difieran **necesita reconciliar cada Pago con Cuenta/Venta/Orden**, no se considera error ni igualdad obligatoria de KPI.
- SEMANA 26/10–01/11: ventas Q22.00, cobros Q90.00, gastos Q329.00 (Q325.00 en 28/10 y Q4.00 en 29/10); la serie diaria suma los KPI.
- MES 01/10–31/10: ventas Q154.00, 8 cuentas cerradas, 6 tickets únicos (promedio Q25.67), cobros brutos Q222.00, reembolsos Q12.00, netos Q210.00, gastos Q329.00; series coherentes.
- PERSONALIZADO 01/10–30/10: mismas cifras del mes en este dataset, sin actividad el 31/10 al momento consultado.
- `SALES_LINES`: 8 líneas, 7 unidades (hay dos medias líneas), Q154.00 y descuentos Q0.00. Cuatro perspectivas (`porProducto`, `porCategoria`, `porVariante`, `porModalidad`) concilian individualmente Q154.00 y cantidades 7; modalidad MOSTRADOR Q132.00 + DELIVERY Q22.00.
- `INVENTORY_MOVEMENTS`: 36 movimientos de 11 tipos. Grupos por tipo, cantidades y costos concilian con las 36 filas. Las 4 entradas tipo COMPRA suman Q60.40.
- `PURCHASE_RECEIPT_LINES`: 4 líneas confirmadas, Q60.40 costo registrado y Q6.96 impuestos; Q60.40 coincide con COMPRA en ledger. La factura de proveedor confirmada por Q22.40 es **otro universo de documentos**, no debe equipararse con todas las recepciones.
- `DELIVERY_EVENTS`: 21 eventos; suma por acción correcta (7 creados, 5 despachados, 5 completados, 2 cancelaciones, 1 asignación y 1 cambio de destino).
- `SUPPLY_REQUESTS`: 7 requisiciones (4 atendidas, 3 canceladas). `SUPPLY_TRANSFERS`: 5 despachos/transferencias en estado actual RECIBIDA.
- Evidencia turno `cmvv3hupg0009fov4ji0uaci8`: 3 movimientos `INGRESO` de Q22.00 = Q66.00, 0 egresos; cada movimiento apunta a `LIQUIDACION_REPARTIDOR` CERRADA, cada liquidación tiene una línea con `pagoId`, `cuentaId`, `entregaId`, `ordenId`, monto Q22.00. IDs de pagos distintos; suma de líneas=esperado=entregado=movimiento. No se contabiliza este ingreso por segunda vez como ventas.
- Los payloads observados están libres de comentarios narrativos `note`, `definicion`, `definitions` en la superficie revisada.
- Dos controles negativos devolvieron 400 esperado: sucursal ausente y origen de reporte no admitido.
- No se observaron discrepancias aritméticas en las sumas de JSON revisadas.

## Bloqueo de permiso `RESERVATION_EVENTS`

La solicitud 05 transversal devolvió `403 Permiso reservations.read insuficiente` en lugar de 200. El código de `DomainReportsStore` exige `reports.read` + `reservations.read` para la sede consultada; el `prisma/seed.ts` actual **sí declara** `reservations.read` para `SUPER_ADMIN` global. No se ha demostrado si el usuario que probó tiene SUPER_ADMIN, si el seed actual ya se aplicó al entorno DEV o si el rol está configurado de manera diferente.

Diagnóstico recomendado: `GET /api/auth/capabilities?sucursalId=<id>`, verificar `reservations.read` y asignaciones de rol; solo luego, si corresponde, sincronizar el seed sobre **la DB DEV identificada**, teniendo en cuenta su configuración bootstrap. Repetir prueba 05 con el rol autorizado y posteriormente un 403 deliberado con rol restringido.

## Validaciones faltantes antes de aceptar REP-1 transversal

1. Ejecutar/compartir respuestas 08 `cash-shifts`, 10 `payments/records`, 11 `expenses/records` de colección inicial.
2. Corregir el 403 de `RESERVATION_EVENTS` para el rol autorizado y verificar su contenido.
3. Cotejar datos fuente PostgreSQL independientes, especialmente Pago ↔ Cuenta ↔ Orden ↔ Venta del 30/10 y los Q66 de repartidores.
4. Verificar paginación en `limit=1` con totales globales no dependientes de página y autorización cruzada de sucursal/roles.
5. Completar REP-1 costos históricos y márgenes con cobertura real, finanzas/proveedores/delivery, multi-sucursal y rendimiento; implementar REP-2 XLSX/CSV/PDF.

**Resultado: revisión parcial favorable, no aprobación final del sprint; PR #18 permanece DRAFT y sin merge.**


## Actualización de QA — fuente de reservaciones validada en DEV

Respuesta posterior aportada por el usuario: `GET /api/reports/analytics/sources/RESERVATION_EVENTS` responde 200 correctamente para sucursal `cmv8p4k3x0001u4v4xor2zgqu` y período 2026-10-01 a 2026-10-30. El bloqueo por `reservations.read` observado antes **está resuelto a nivel de llamada HTTP**. No se ha verificado desde aquí qué procedimiento exacto de asignación/seed efectuó el usuario.

- `totales.eventos=10`; `porAccion`: 4 CREATED, 3 CANCELLED, 1 CHECKED_IN, 1 CONFIRMED, 1 UPDATED. `4+3+1+1+1=10`.
- `meta.page=1`, `meta.limit=100`, `meta.total=10`, `meta.totalPages=1`; la respuesta incluye exactamente 10 filas y no se detectan IDs de evento duplicados.
- 4 reservas distintas: 1 en estado actual `COMPLETADA`, 3 en estado actual `CANCELADA`. `reserva.estado` es un estado actual leído del registro, no un campo histórico `estadoDespues`: los eventos CREATED/CONFIRMED pueden mostrar CANCELADA posteriormente.
- La cronología de cada reserva registrada no muestra acciones duplicadas en esta muestra; todos los eventos informados son del 30/10 y corresponden al período solicitado.
- **Nuevo corte: 19/22 solicitudes con respuestas satisfactorias**, incluidos los 2 errores 400 negativos esperados; **solo faltan 3 respuestas iniciales**: 08 turnos caja, 10 cobros individuales, 11 gastos individuales. Siguen pendientes las conciliaciones SQL fuente y pruebas adicionales de paginación y RBAC cruzado. REP-1/REP-2 no terminados, PR #18 DRAFT.
