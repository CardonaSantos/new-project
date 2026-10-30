# DEL-A — Auditoría de fluidez operativa antes del merge

**30 de octubre de 2026 · rama `feat/del-a-customers-delivery` · PR #14 DRAFT**

## Pregunta operativa
¿La implementación obliga a un operador a realizar clics, aprobaciones o procedimientos que no aportan valor a un servicio de delivery? Auditoría de **acciones funcionales y contratos**; no es una medición de latencia en producción, ya que no se han ejecutado pruebas de carga ni existe todavía el frontend Angular definitivo.

## Flujo diario propuesto — sin autorizaciones redundantes

| Actor | Trabajo normal | Acciones exigidas por negocio | Optimización |
| --- | --- | --- | --- |
| Vendedor/caja | Abrir pedido DELIVERY | 1: crear orden; opcional enviar cocina con `enviarCocina:true` | El operador puede seleccionar repartidor al crear la entrega, sin solicitud de aprobación |
| Gestión | Preparar despacho | 1: crear entrega con `repartidorId` (sin usar `/assign` por separado), 1: despachar | El frontend puede encadenar creación de orden y entrega tras una única confirmación del formulario |
| Cocina | Preparación | 1: marcar comanda LISTA cuando se preparó | La ruta de preparación se resuelve automáticamente desde catálogo, sin asignación manual por ticket en operación normal |
| Repartidor | Reparto | 1: confirmar entrega física, 1: registrar cobro si corresponde | Son hechos auditables distintos; la UI puede presentarlos en una misma pantalla sin requerir entrar y salir de módulos |
| Caja/gestión | Cierre de la orden | Cierre PAY-A cuando todos los requisitos se cumplen; `closure-readiness` es una consulta automática, no una aprobación | En Angular, si el operador tiene permisos, ejecutar `finalize-order` tras completar la entrega (o después del último pago) sin imponer otro botón, salvo que existan blockers |
| Caja/gestión | Recibir efectivo del repartidor | **1: `POST /api/deliveries/settlements/couriers/close-direct`** | El flujo de 2 acciones (crear ABIERTA / cerrar) queda solo para incidencias o arqueos que requieren revisión; no hay segunda aprobación |
| Administración | Conciliar plataforma | 1: registrar liquidación del periodo cuando llega la transferencia; bruto-comisión-neto | PAY-A registra Pago bruto una vez, FIN-A ingreso bancario neto una vez; no hay doble cobro ni caja ficticia |

**Los 27 o 30 requests de las colecciones Postman son escenarios de QA, no pasos que deba seguir un empleado.** Tampoco se solicitan IDs Prisma manuales en la UI: deben originarse en selecciones de pedidos, repartidores, pagos pendientes, turnos y bancos.

## Mejora implementada tras la auditoría

### Liquidación directa del repartidor
`POST /api/deliveries/settlements/couriers/close-direct`

```json
{
  "sucursalId":"ID_SUCURSAL",
  "repartidorId":"ID_REPARTIDOR",
  "pagoIds":["ID_PAGO_EFECTIVO"],
  "turnoCajaId":"ID_TURNO_ABIERTO",
  "totalEntregado":"22.00",
  "claveOperacion":"UX:COURIER:DIRECT:001"
}
```

- Consulta pagos elegibles; exige misma sucursal y repartidor asignado, entrega ENTREGADA, Pago EFECTIVO recibido por courier y no liquidado/reembolsado.
- Exige `delivery.settlements.manage` y `cash.manage` del actor, un turno activo del mismo día operativo/sucursal y cantidad entregada idéntica a la esperada.
- En **una sola transacción PostgreSQL SERIALIZABLE**, crea `LiquidacionRepartidor` ya CERRADA con sus líneas, **un** `MovimientoCaja` vinculado, auditoría/outbox y resultado idempotente; devuelve todos los datos de la operación sin una segunda lectura/transacción. No crea otro Pago.
- Reintentos con la misma clave/payload devuelven el mismo movimiento, incluso si luego se cierra el turno; una clave distinta para los mismos pagos recibe 409, protegida también por `LiquidacionRepartidorLinea.pagoId UNIQUE`.
- No permite conciliar diferencias silenciosamente. Ante faltante: mantener el flujo original `POST /settlements/couriers`, `POST /:id/discrepancy` y `POST /:id/close` cuando el efectivo completo se recibe.
- Conserva los endpoints anteriores por compatibilidad con D3, sin romper los ensayos que ya aprobó el usuario.

### Verificación adicional en DEV

Colección independiente de **9 solicitudes**, importable desde:
`docs/del-a/Gastro_Core_DEL_A_UX_Direct_Cash.postman_collection.json`.

Requiere variables de colección `baseUrl`, `token`, `sucursalId`, `courierId`, `varianteId` (Q22 en DEV) y `turnoCajaId` (turno abierto del día); `runId` y IDs posteriores los genera Postman. Ejecutar **solo en PostgreSQL DEV**. La colección crea una orden sintética, entrega, pago, liquidación directa, reintento idempotente y rechazo por intento duplicado con otra clave.

## Límites y riesgos que no debemos confundir con UX

- **No se ha medido latencia bajo carga:** las pruebas CI, Postman secuencial y los índices no demuestran tiempos de respuesta p95/p99 reales. Liquidaciones de plataforma con hasta 100 líneas recorren pagos individuales en una transacción; podría requerir optimización por lotes para altos volúmenes. Medir antes de producción con carga representativa.
- El frontend Angular todavía debe decidir las orquestaciones descritas; **API granular no significa que debamos mostrar un botón por endpoint**. La mejora de una sola confirmación existe ahora en el backend para efectivo; el resto dependerá de construir la UI correctamente.
- No permitir que repartidor `delivery.courier` pueda crear ventas o cerrar caja mediante la orquestación UI; esas acciones permanecen detrás de permisos de gestión.
- Guardas de estado, auditoría, día financiero, idempotencia y conciliación **no son aprobaciones humanas**; no se eliminan para ahorrar clics.
- No ocultar fallos financieros: los casos de faltante, pago pendiente, comanda sin terminar o entrega no realizada muestran una condición precisa y evitan un cierre falso.
- Reversas extraordinarias de plataformas continúan bloqueadas hasta contar con un proceso bancario reconciliado, como se documentó en D4.

## Criterios antes de fusionar
1. CI HEAD SUCCESS: compilación, pruebas y PostgreSQL migration-smoke.
2. Probar las **9 solicitudes del nuevo atajo en DEV** y verificar un solo MovimientoCaja y respuesta 409 ante segundo depósito.
3. Documentar el resultado en PR #14 e issue #13; mantener el PR en DRAFT hasta confirmar lo anterior. No fusionar sin terminar esta revisión previa pedida por el usuario.
4. Merge autorizado únicamente cuando se cumplan estos puntos; después RSV-A.
