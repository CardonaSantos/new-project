# REP-1 — Revisión de respuestas Postman DEV (30/10/2026)

**Fuente:** archivo compartido por el usuario con diez respuestas numeradas `00, 1, 2, 3, 4, 5, 6, 7, 8, 06` (la última etiqueta es incorrecta en el texto, corresponde al caso 09 de validación 400). No contiene todos los códigos HTTP observados ni comprobación SQL independiente.

**Alcance de esta revisión:** consistencia de respuesta y de sumas entre APIs; **no** afirmar auditoría de datos originales ni aceptación completa de REP-1.

## Datos de muestra realmente observados, sucursal PRINCIPAL

- Dashboard operativo (00): 9 pedidos `ABIERTA`, 0 comandas pendientes, 0 preparando, 1 mesa ocupada, 0 entregas en reparto, 0 reservas próximas y 1 turno de caja abierto. Lectura `LIVE_READ`.
- `DIA` (01), fecha operativa 2026-10-30, zona `America/Guatemala`, corte `04:00`: UTC [2026-10-30T10:00:00Z, 2026-10-31T10:00:00Z). Venta neta Q22 (1 venta/cuenta, 1 ticket), ticket promedio Q22; 4 cobros por Q88, reembolsos Q0, gastos Q0, 0 turnos cerrados, 1 abierto; diferencia de caja `null` por no tener turnos cerrados.
- `SEMANA` (02), lunes 26 oct. a domingo 1 nov.: ventas Q22, cobros Q90, gastos Q329 (Q325 el 28, Q4 el 29), 2 turnos cerrados, diferencia total mostrada Q0 y 1 turno actualmente abierto.
- `MES` (03), octubre: ventas Q154, 8 cuentas cerradas pertenecientes a 6 órdenes únicas, ticket promedio Q25.67 (154/6); cobros Q222, reembolsos Q12, cobros netos Q210, gastos Q329; 3 turnos cerrados, diferencia Q0, 1 turno actualmente abierto. Ventas Q132 y 7 cuentas del día 16, más ventas Q22 y 1 cuenta del día 30.
- `PERSONALIZADO` (04), del 1 al 30 oct.: mismas cifras totales que MES, pues el día 31 aparece con importes cero en la consulta mensual.
- `TICKETS` (05): venta `VT-32ecf92f-9cde-43`, Q22, cierre 2026-10-30T16:05:08.642Z, orden `ORD-e0162508-788`, modalidad `DELIVERY`, origen `CAJA`, 1 fila. Coincide con ventas del DIA.
- `PAYMENTS BY METHOD` (06): efectivo Q66 en 3 cobros + otro Q22 en 1 cobro, tarjeta/transferencia Q0, total Q88, reembolsos Q0. Coherente con cobros del DIA.
- `EXPENSES BY CATEGORY` (07): `data:[]`, `totalRegistrado:Q0`, coherente con gastos del DIA.
- `CASH SHIFTS` (08): turno `cmvv3hupg0009fov4ji0uaci8` abierto, fondo inicial Q0; `efectivoEsperado`, `efectivoContado` y `diferencia` nulos; 3 movimientos INGRESO por Q66, coherentes con 3 cobros EFECTIVO por Q66, sin doble contabilización.
- Solicitud final (debería llamarse 09; figura `06` en texto): respuesta `400` porque falta `sucursalId`, validación correcta.

## Reconciliaciones calculadas sobre los JSON recibidos

| Regla | Resultado |
| --- | --- |
| Suma de `serieDiaria.ventasNetas` = `kpis.ventasNetas` | Cumple en DIA, SEMANA, MES, CUSTOM |
| Sumas de cobros, reembolsos y gastos en serie = KPI agregado | Cumple en los 4 períodos |
| `cobrosNetos = cobrosBrutos - reembolsos` | Cumple: DIA 88-0=88; MES 222-12=210 |
| Métodos de pago = cobros DIA | Cumple: 66+22=88 |
| Gastos por categoría = gastos DIA | Cumple: no hay registros en ambos |
| Ticket día = venta única de Q22 | Cumple: 1 venta, 1 orden, Q22 |
| MES = CUSTOM 1–30/oct cuando el 31 tiene ceros | Cumple |
| Corte GT 04:00 => UTC 10:00 | Cumple |
| Turnos abiertos y ocupaciones visibles en operativo | Consistente, sin confirmación externa de cantidad física |

**Diferencia que NO es un error por sí sola:** el 30 de octubre hay ventas Q22 y cobros Q88; la semana ventas Q22/cobros Q90; el mes ventas Q154/cobros Q222. El hecho de venta se reconoce en `Venta.cerradaEn`, el cobro en `Pago.cobradoEn`. Los clientes pueden abonar previamente o pagar cuentas de otro día. **Hace falta drilldown de pagos para identificar cada fuente**, no inferir ni ajustar artificialmente las diferencias.

**Otro dato clave:** ocho cuentas cerradas representan seis tickets/órdenes únicas porque existe división de cuentas; el cálculo de Q154/6 es correcto según la definición vigente.

### Mejora defensiva detectada al auditar el código

El overview anterior calculaba `diferenciaCajaCerrada=0.00` si había un turno cerrado sin dato `diferencia`, debido a la conversión de `NULL` a cero. Se cambió para que devuelva `null` y `estadoDiferenciaCaja=INCOMPLETO` cuando falte cualquier diferencia de caja de un turno cerrado. Solo devuelve Q0 cuando todas las diferencias están registradas y suman realmente Q0. **Las respuestas DEV ya recibidas preceden esta corrección y deben repetirse** para verificar los metadatos nuevos.

## Próximas pruebas necesarias

1. Ejecutar nuevamente Postman con la colección ampliada (10 requests, comparaciones automáticas en centavos); correr en DEV sin movimientos simultáneos que cambien los totales entre requests.
2. Verificar independientemente en DEV las fuentes `Venta`, `Pago`, `ReembolsoPago`, `GastoOperativo` y `TurnoCaja` con consultas/auditoría de lectura, sin modificar estados.
3. Confirmar que diferencia de caja de Q0 en dos y tres turnos cerrados proviene de cierres reales con `diferencia` no nula; si faltan, endpoint corregido mostrará `INCOMPLETO`.
4. Comprobar `403` con un usuario sin `reports.read` o de otra sucursal; token de admin no sirve para demostrar aislamiento.
5. Analizar por qué aparecen nueve órdenes abiertas y una ocupación activa en DEV; cerrar solo por flujos existentes del backend cuando proceda.
6. Avanzar REP-1 por demás fuentes antes de REP-2 Excel/CSV/PDF. El PR sigue DRAFT; no merge.
