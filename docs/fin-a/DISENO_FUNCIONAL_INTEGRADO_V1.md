# FIN-A — Diseño funcional integrado V1 (aprobado 2026-10-28)

> Documento de diseño, no prueba de implementación. PR #12 permanece Draft. La fase 1 de cuentas financieras ya pasó nueve solicitudes DEV y CI. Esta guía recoge las decisiones operativas confirmadas para los siguientes incrementos.

## Objetivo
FIN-A es propietario de gastos operativos, cuentas/registro de movimientos financieros, conciliación y cierre operativo. PAY-A es propietario de caja/turnos, ingresos de venta, cobros/reembolsos y arqueos. PUR-A es propietario de órdenes, facturas y pagos a proveedores. INV-B/SUP-A son propietarios de existencias, traslados y valoración. No contabilizar dos veces el mismo hecho.

## 1. Gasto desde caja
- Crear un `GastoOperativo` pagado en efectivo y **exactamente un** `MovimientoCaja` tipo `EGRESO` asociado mediante `gastoId` (ya `@unique` en Prisma).
- Misma transacción `SERIALIZABLE` para gasto + egreso + auditoría + outbox + operación idempotente. Nunca llamar a un endpoint ni a un método que abra una transacción anidada independiente desde la transacción financiera.
- Reusar validación PAY-A de turno abierto/propietario o permiso administrativo según política, sucursal, disponibilidad de efectivo calculada con fondo inicial y movimientos y tipo `EGRESO`. Validar también `finance.expenses.create` (y un permiso separado para gastar desde caja si se adopta granularidad).
- No añadir un `MovimientoFinanciero` bancario al gasto en caja. No abrir/alterar un turno por cuenta propia. Un reintento o fallo no provoca dos salidas.
- Respetar la fecha operativa configurada en la sucursal y la política de cierre cuando el control de cierre esté disponible.

## 2. Gasto pagado mediante cuenta financiera
- Gasto `GastoOperativo` con `cuentaFinancieraId`, sin `turnoId`.
- Crear **exactamente un** `MovimientoFinanciero` negativo por el monto pagado, con `referenciaTipo='GASTO_OPERATIVO'` y `referenciaId=gasto.id`.
- Exigir cuenta activa en la misma sucursal, moneda compatible y referencia bancaria/documental, además del permiso financiero; transacción `SERIALIZABLE` y auditoría.
- Añadir garantía de unicidad para el asiento por gasto en DB (recomendable índice único parcial por referencia de gasto). El esquema actual `MovimientoFinanciero` **no** impone unicidad de referencia.
- Registrar un pago declarado/soportado, **no** ejecutar transferencias bancarias ni marcarlo como conciliado por un banco externo. `saldoRegistrado` puede ser negativo si no se ha contabilizado apertura; no compararlo con fondos reales hasta adoptar política de saldo inicial/conciliación.

## 3. Idempotencia gestionada por el servidor
**Nueva política:** las claves de idempotencia nunca se generan ni muestran al usuario. No crear una clave nueva en cada intento POST: eso haría imposible identificar los reintentos.
- Antes de guardar una operación, emitir desde backend una intención/identificador opaco seguro, persistido y ligado a usuario, sucursal y tipo de operación, con vencimiento y estado. La UI solo lo transporta/reutiliza de manera transparente.
- La creación de gasto requiere dicho identificador. Intento repetido con mismo payload retorna la misma respuesta; mismo identificador con payload distinto => `409`; rol/sucursal distintos => rechazo. Proteger concurrencia en DB.
- Los procesos internos pueden derivar una identidad estable del origen de negocio único (p. ej. un gasto ya creado); no inventar un UUID nuevo por reintento.
- FIN-A Fase 1 aún exige `claveOperacion` en su API de cuentas; se adaptará sin cambios silenciosos de los contratos de PAY-A, PUR-A, SUP-A y otros módulos. Publicar ruta de migración por versiones y pruebas de compatibilidad.

## 4. Clasificación correcta
- `GastoOperativo` V1 cubre erogaciones efectivamente pagadas para operar: energía, renta, agua, conectividad, servicios, mantenimiento y consumibles no administrados como inventario.
- Insumos/SKU recibidos para control de existencias => flujo PUR-A/INV-B y reconocimiento de costo de consumo cuando corresponda; no registrar la misma compra además como `GastoOperativo`.
- Factura de proveedor y pago desde PUR-A => no duplicar la erogación con una segunda alta en FIN-A. Integrar el asiento financiero por evento confirmado de PUR-A con referencia de origen e idempotencia.
- Gasto a crédito, devengo pendiente, pagos parciales, impuestos complejos, nóminas y conciliación bancaria automática se tratan como expansiones explícitas; no fingir que están cubiertos por un gasto V1 pagado.

## 5. Alcance FIN-A completo
1. Cuentas financieras: alta, catálogo, consulta y movimientos registrados (fase 1 implementada).
2. Gastos: categorías, soporte/documento, proveedor opcional, búsqueda/paginación, origen único caja o cuenta, contabilización atómica y controles de duplicidad, devolución/rectificación auditada (V1 por definir en implementación).
3. Asientos financieros: procedencia verificable, efecto firmado, consulta, conciliación y correcciones auditadas. Integración con pagos confirmados PAY-A/PUR-A y, cuando proceda, liquidaciones DEL-A; no doble cómputo.
4. Cierre: resumen preliminar por sucursal y fecha operativa (zona horaria + `horaCorteOperativo`), turnos, ventas, reembolsos, egresos, cuentas bancarias y excepciones; `CierreOperativo` único y persistente con resúmenes y trazabilidad. Ajustes posteriores requieren proceso auditado, no editar cierres históricos directamente.
5. Reportes: entregar métricas confiables a REP-A (gasto por categoría/sucursal/periodo, variaciones, resultado operativo). REP-A agrega, no recontabiliza.

## 6. Relaciones
| Módulo | Titularidad | Integración FIN-A |
| --- | --- | --- |
| Auth/Users/Organization | Usuario, rol, sucursal, zona horaria, corte | RBAC por sucursal, configuración de período |
| PAY-A | TurnoCaja, MovimientoCaja, Pago, Venta, ReembolsoPago | Crear exactamente un gasto-egreso asociado en transacción común; lectura de turnos/ventas para cierre |
| PUR-A | OC, recepciones, facturas y pagos a proveedores | Reconocer solo pagos confirmados; evitar doble gasto/egreso y duplicar SKU |
| INV-B / REC-A / SUP-A | Kardex, costos, producción, abastecimiento | Separar costo de inventario/consumo de gasto operativo |
| Media | Documentos de soporte | Asociar comprobante sin tratar URL como confirmación bancaria |
| DEL-A futuro | Repartidores, canales, comisiones y liquidaciones | Incorporar asientos de liquidación una sola vez |
| REP-A futuro | Informes, márgenes, KPIs | Leer métricas de FIN-A, PAY-A y costos sin registrar dinero |
| FEL / integraciones futuras | Documentación fiscal, bancos | Referenciar documentos y conciliación, no asumir emisión/conciliación actual |

## 7. Contratos propuestos (aún NO implementados)
- `POST /api/finance/operation-intents`: emitir intención segura y persistida vinculada a acción/sucursal/autorización.
- `POST /api/finance/expenses`: registrar gasto pagado con `operationId` emitido por servidor y origen exclusivo.
- `GET /api/finance/expenses?sucursalId=&page=&limit=`, `GET /api/finance/expenses/:id`.
- `GET /api/finance/closing/preview?sucursalId=&fechaOperativa=`, `POST /api/finance/closing`, `GET /api/finance/closing/:id`.

## 8. Pruebas que bloquean el merge
- Efectivo suficiente/insuficiente; turno abierto/cerrado/ajeno, diferentes sucursales, permiso 403 real.
- Dos solicitudes concurrentes idénticas; timeout/reintento; token de intención ajeno, expirado o cambiado; unicidad real de movimiento.
- Egreso Q75: EXACTAMENTE un gasto y un movimiento caja Q75; saldo y cierre PAY-A consistentes.
- Banco Q250: EXACTAMENTE un gasto y un movimiento financiero -Q250; cero movimientos en caja, referencia/moneda/cuenta verificados.
- No dos asientos por una factura PUR-A; compra de stock no doble gasto.
- Reversión/rectificación auditada e historial; previsión de cierre por día operativo; CI/migraciones + pruebas DEV/Postman.

**Implementar incrementos en la rama existente `feat/fin-a-finance-operations`, PR #12. No mergear FIN-A hasta completar su macroflujo #21.**
