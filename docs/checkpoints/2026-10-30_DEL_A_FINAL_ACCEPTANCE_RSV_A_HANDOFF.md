# Gastro Core — DEL-A / Aceptación funcional y transferencia a RSV-A

**Fecha:** 2026-10-30 (Guatemala). **Proyecto:** Gastro Core, NestJS + Prisma + PostgreSQL.
**PR:** https://github.com/CardonaSantos/new-project/pull/14
**Issue:** https://github.com/CardonaSantos/new-project/issues/13
**Rama de entrega:** `feat/del-a-customers-delivery`. **Revisión base:** `main@36935d3a28758e46c672f49257de99c752a00db6` (FIN-A). 
**Estado de este documento:** preparado antes del merge; el merge y su SHA deben verificarse por separado.

## Alcance funcional recibido

- **D1 — Customers + ORD-A:** cliente, relación cliente/sucursal, direcciones, contacto, privacidad, operación anónima, y reglas de cliente activo en creación/edición de pedido. DEV validado con pruebas Postman de D1 y ORD-A.
- **D2 — Delivery:** entrega vinculada a pedido, asignación DIRECTA del repartidor al crear o mediante `/assign` sin segunda aprobación; despacho, completar, cancelar, cambiar destino predespacho, historial, permisos por sucursal, transacciones idempotentes. DEV: 20 respuestas coherentes. Fix posterior: al editar solo dirección no borrar teléfono/referencia no enviados; cobertura CI, retest DEV aislado no presentado.
- **D3 — Cobros y liquidaciones:** PAY-A reconoce efectivo del repartidor sin TurnoCaja ni MovimientoCaja prematuro. FIN-A registra solo el neto de plataforma (bruto menos comisión); referencia externa y origen únicos, sin volver a imputar bruto. DEV: 30 respuestas Postman funcionalmente correctas, incluidas diferencias de efectivo y replay.
- **D4 — Cierre integral:** ORD-A/PAY-A exige Entrega ENTREGADA y productos de cocina enviados/listos, cuentas pagadas; cierre directo de la orden delegado a PAY-A, Venta única, respuesta `alreadyClosed` en replay. Cancelar Orden PENDIENTE sincroniza Entrega y evento. DEV: 27 respuestas Postman correctas.
- **Auditoría UX antes de merge:** se eliminó doble paso innecesario para liquidación regular. `POST /api/deliveries/settlements/couriers/close-direct` realiza en **UNA confirmación/UNA transacción SERIALIZABLE** liquidación CERRADA, líneas, un solo MovimientoCaja y auditoría, sin consulta adicional tras el commit. El flujo de varias acciones continúa únicamente para discrepancias. No existe aprobación de asignación de repartidor.

## Última prueba DEV: liquidación directa

**Colección:** `docs/del-a/Gastro_Core_DEL_A_UX_Direct_Cash.postman_collection.json` (9 solicitudes, 00–08). Las 00–04 ya habían producido orden, entrega, pago Q22, despacho y confirmación de entrega; el operador reinició su servidor para cargar la nueva ruta (antes devolvía 404), luego las 05–08 se ejecutaron con éxito:

- **05:** `LiquidacionRepartidor.id=cmvv7lmbg00025gv4camb9s06` en CERRADA; totalEsperado=totalEntregado=Q22, entrega asociada y `MovimientoCaja.id=cmvv7lmbw00045gv4lzlo9hmd`.
- **06:** repetir exactamente la operación devolvió **mismo `id` y `movimientoCajaId`**.
- **07:** nueva clave con mismo `pagoId` rechazó **409** (pago ya liquidado), sin ingreso duplicado.
- **08:** GET del registro refleja CERRADA, turno, línea por Pago y el mismo movimiento.
- El Pago de prueba fue `cmvv71hlf002n4gv4s382xq5q`. No hay evidencia de un segundo asiento de caja.
- La última CI de código `12d61d778f654e794650ef22503c5d7e7878d3c7`: https://github.com/CardonaSantos/new-project/actions/runs/41089924071 **SUCCESS: 211 unitarias, 77 HTTP, build/Prisma y migration-smoke PostgreSQL**.

## Estado de riesgo y alcance del cierre

- **Aceptación funcional DEV:** D1, D2, D3, D4 y la optimización de liquidación directa — *sí*, con las pruebas secuenciales mencionadas.
- **No se declara certificación de producción**, ni rendimiento p95/p99, test de concurrencia real bajo carga, otros roles/sucursales en DEV, ni reconciliación bancaria real de plataformas. El backend usa RBAC, transacciones e índices únicos, pero esos mecanismos no sustituyen tales evidencias.
- **Reembolso extraordinario de plataforma:** expresamente bloqueado hasta contar con proceso de reversa bancaria confirmada; no permitir SQL o devoluciones manuales fuera del flujo.
- **ComandaLinea.entregadaEn** no se marcó individualmente en la prueba D4 aunque la comanda fue LISTA y la entrega ENTREGADA; seguimiento de trazabilidad, no error financiero demostrado.
- **Órdenes D3 sin enviar cocina:** permanecen ABIERTAS aunque Entrega figure ENTREGADA y Cuenta pagada; no forzar estados en Prisma.
- **Operación cotidiana Angular:** un formulario de pedido puede encadenar creación y cocina; seleccionar repartidor al crear entrega; `closure-readiness` es consulta automática, no botón. No exigir IDs Prisma manualmente ni presentar cada endpoint como un paso.
- **Performance:** conciliar hasta 100 líneas de plataforma hace operaciones individuales en una transacción. Medir y optimizar a escala antes de producción, sin añadir aprobaciones humanas innecesarias.

## Despliegue y siguiente módulo

- **Sin migraciones/seed adicionales para D4 y UX.** D1/D3 sí incluyen migraciones/seed ya ejecutados en DB DEV durante sus pruebas. Al desplegar en otro entorno, ejecutar `prisma:status` / `prisma:deploy` / `prisma:seed` solo tras verificar conexión, respaldo y plan operacional.
- **Hito de cierre:** fusionar PR #14 únicamente conforme a la autorización previa del propietario, verificando CI del último HEAD y el SHA real de `main` después del merge. Registrar resultado en issue #13.
- **Siguiente módulo, sin mezclar scope:** **RSV-A Reservaciones**; después QR-A Autoservicio y REP-A Reportería. Reusar Customers, Orders, Branches, RBAC y auditoría. Según el checkpoint de planificación, `main` antes de DEL-A llevaba 12/16 bloques y 21/26 macroflujos; tras integrar DEL-A sería 13/16 y 23/26.
