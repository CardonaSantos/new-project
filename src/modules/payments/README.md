# PAY-A — Caja, Pagos y Ventas (backend NestJS/Prisma)

## Propósito y propiedad
Checkpoint funcional que cierra el ciclo ORD-A → Cuenta → Pago → Venta interna → cierre de Orden y liberación de mesa.
PAY-A no implementa FEL, terminal física ni pasarela obligatoria. No contabiliza inventario: REC-A/INV-B ya lo hicieron en cocina.
Integración con ORD-A: `POST /api/orders/:id/close` conserva la respuesta detallada original y delega la liquidación interna a PAY-A. Un cobro confirmado que liquida todas las cuentas de una orden ya preparada/cuyas líneas están enviadas la cierra automáticamente. Si falta preparación, usar `POST /api/accounts/order/:orderId/finalize` tras finalizar cocina.

## Endpoints reales (prefijo /api, Bearer JWT)
| Método | Ruta | Función |
|---|---|---|
| GET/POST | /cash/registers | Listar por sucursal / crear caja |
| PATCH | /cash/registers/:id | Actualizar nombre/estado |
| GET/POST | /cash/shifts | Listar / abrir turno con fondo inicial |
| GET | /cash/shifts/:id | Turno con movimientos, arqueo y efectivo calculado |
| POST | /cash/shifts/:id/movements | Ingreso/egreso manual autorizado |
| POST | /cash/shifts/:id/close | Arqueo y cierre atómicos |
| GET | /accounts/order/:orderId | Cuentas y asignaciones de la orden |
| GET | /accounts/:id | Cuenta, saldo, pagos, intentos, reembolsos y venta |
| POST | /accounts/:id/payments | Cobro confirmado mixto + intentos de transferencia pendientes |
| POST | /payment-attempts/:id/confirm | Confirmar transferencia verificada (permiso especial) |
| POST | /payment-attempts/:id/cancel | Cancelar intento pendiente por cambio de método |
| POST | /accounts/order/:orderId/split | Dividir por líneas y cantidades/importes explícitos |
| POST | /accounts/order/:orderId/split-equal | Dividir importe y cantidades a partes iguales |
| POST | /accounts/order/:orderId/finalize | Liquidar orden con todas las cuentas pagadas y cocina terminada |
| POST | /payments/:id/refund | Reembolso parcial o total auditado |
| GET | /sales y /sales/:id | Listado paginado / detalle de ventas internas |
| GET | /payment-reports/summary?sucursalId= | Totales brutos, reembolsos, netos, métodos y caja |

## Ejemplos de cuerpos
- Apertura: `{"cajaId":"<id>","fondoInicial":"100.00","claveOperacion":"CASH:OPEN:001"}`.
- Cobro mixto: `{"turnoId":"<id>","claveOperacion":"PAY:MIX:001","pagos":[{"metodo":"EFECTIVO","monto":"20.00","efectivoRecibido":"50.00"},{"metodo":"TARJETA","monto":"7.00","codigoAutorizacion":"POS123","terminalReferencia":"T1"}]}`.
- Transferencia pendiente: `{"turnoId":"<id>","claveOperacion":"PAY:TRANSFER:001","pagos":[{"metodo":"TRANSFERENCIA","monto":"27.00","referencia":"BANCO-123"}]}`. No suma al pagado hasta confirmación.
- Confirmación: `{"turnoId":"<id>","motivo":"Transferencia comprobada en banco","claveOperacion":"PAY:VERIFY:001"}`.
- Reembolso: `{"monto":"5.00","motivo":"Devolución autorizada","turnoId":"<id>","claveOperacion":"PAY:REFUND:001"}` (si no es efectivo necesita referenciaExterna, y turnoId puede omitirse).
- División igual: `{"personas":3,"claveOperacion":"PAY:SPLIT:001"}`.
- División por productos/importes: `{"claveOperacion":"PAY:SPLIT:MANUAL:001","cuentas":[{"nombre":"Persona A","lineas":[{"ordenLineaId":"<id>","cantidadAsignada":"0.500","importeAsignado":"11.00"}]},{"nombre":"Persona B","lineas":[{"ordenLineaId":"<id>","cantidadAsignada":"0.500","importeAsignado":"11.00"}]}]}`. Toda la cantidad y el importe neto de cada línea deben quedar asignados exactamente.
- Cierre caja: `{"efectivoContado":"120.00","notaCierre":"Conteo correcto","claveOperacion":"CASH:CLOSE:001"}`.

## Reglas centrales
- Sucursal real derivada de Caja/Cuenta/Orden, permiso por rol global o sucursal. `x-sucursal-id` no concede acceso.
- Turno de cajero abierto para cobros, tarjeta externa y transferencias; **no** requiere conexión física a banco. Un cajero tiene como máximo un turno abierto; una caja solo un turno abierto (índices únicos parciales).
- Moneda decimal de dos dígitos sin floats. `efectivoRecibido` y `vuelto` se preservan en Pago; MovimientoCaja contabiliza solo el monto neto efectivamente retenido. Pago electrónico no crea MovimientoCaja.
- Transferencia genera IntentoPago PENDIENTE que **reserva saldo** hasta verificación/cancelación. Nunca registra Pago ni modifica Cuenta.pagado sin confirmación explícita. Una orden liquidada cancela intentos pendientes remanentes.
- El cobro puede ser parcial/mixto; `Cuenta.pagado` solo mide **pagos confirmados brutos** y no disminuye al reembolsar. `reembolsado` y `netoRecibido` se exponen separadamente. La venta interna permanece histórica tras un reembolso.
- Dividir cuentas exige una cuenta principal abierta SIN pagos ni intentos. No se permiten ediciones de líneas tras dividir; ORD-A impide recálculo incompatible. Un split verifica asignación exacta de importe y cantidad para cada línea.
- Generación de Venta ocurre una vez por Cuenta cuando todas las cuentas de la orden están pagadas, las líneas enviadas y cocina no tiene comandas pendientes. El índice UNIQUE de Venta.cuentaId protege duplicación.
- Reembolsos registran documento independiente con motivo. Un reembolso en efectivo necesita caja abierta y saldo físico suficiente; otros métodos requieren referencia externa y confirmación manual de salida.
- Cualquier mutación monetaria importante exige claveOperacion. Reintento idéntico devuelve resultado sin aplicar otro cobro; otra solicitud con la misma clave es conflicto. SERIALIZABLE impide carreras monetarias; en conflicto 409 se puede consultar saldo y reintentar.
- El cierre de caja calcula fondoInicial + ingresos - egresos y guarda ArqueoCaja con diferencia. No hay cierre operativo financiero por sede todavía (FIN-A).
- Los gastos externos, pagos a proveedores, liquidaciones de repartidores, integración bancaria automática, FEL y hardware corresponden a otros módulos/etapas.

## Permisos en seed
`cash.read`, `cash.manage`, `cash.open`, `cash.close`, `payments.read`,
`payments.collect`, `payments.verify`, `payments.split`, `payments.refund`, `sales.read`.
Se asignan al SUPER_ADMIN por seed. Para roles de cajero/supervisor, configurar la matriz explícitamente con Users; verificar operaciones 403 por sucursal.

## Migración, CI, PostgreSQL/Postman
`prisma/migrations/20261017140000_pay_a_cash_and_payment_integrity` agrega índices parciales por caja/cajero en turnos abiertos, checks monetarios, `Pago.efectivoRecibido` y `Pago.vuelto`. No elimina datos. Revisar preexistencias antes de aplicar.
```powershell
npm ci
npm run prisma:status
npm run prisma:validate
npm run build
npm test
npm run test:e2e
# Tras respaldar y revisar DATABASE_URL y SQL:
npm run prisma:deploy
npm run prisma:seed
```
CI usa mocks para HTTP; no declara transacciones con la base real validadas. Probar con Postman en una PostgreSQL de pruebas: apertura y cierre, pago efectivo y mixto, transferencia pendiente/confirmación, sobrecobro, doble submit, división, reembolsos, Kardex sin nuevos consumos, aislamiento de sucursales y permisos.
