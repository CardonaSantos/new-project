# FIN-A — Finanzas, gastos y cierre operativo (macroflujo 21)

**Estado:** PR #12 abierto en BORRADOR. FIN-A no está listo para merge: las fases de conciliación y cierre operativo siguen pendientes.

## Decisión UX: una acción por decisión real
- Registro de gasto = **un clic «Guardar gasto»**. No hay solicitud de aprobación ni segundo clic para contabilizar.
- Al abrir el formulario, el cliente realiza **internamente** `POST /api/finance/operation-intents` para recibir un `operationId` emitido por el servidor; no pide al usuario generar/copiar claves. El formulario conserva este identificador durante reintentos, caídas de red y doble clic. **No emitir uno nuevo por cada intento de guardar**.
- Una solicitud confirmada devuelve el mismo resultado ante reintentos; el mismo identificador con datos distintos => HTTP 409.
- No crear intenciones al cargar todas las páginas: solicitar solo cuando se abre un formulario de alta. Las intenciones sin usar caducan en 24 horas y no registran dinero.

## Fase 1: cuentas y libro financiero
- `GET /api/finance/accounts?sucursalId=...`: cuentas financieras, paginadas y con `saldoRegistrado` desde movimientos firmados.
- `GET /api/finance/accounts/:id`, `GET /api/finance/accounts/:id/movements`.
- `POST /api/finance/accounts`: alta idempotente, auditada y autorizada. **Cambio de contrato:** sustituye `claveOperacion` (antes enviada por cliente) por `operationId` generado por servidor.
- `saldoRegistrado` no equivale a saldo bancario conciliado.

## Fase 2: gastos operativos
- `POST /api/finance/operation-intents` body `{"sucursalId":"...","accion":"FIN_EXPENSE_CREATE"}` o `FIN_ACCOUNT_CREATE`: devuelve `operationId`, vencimiento y contexto.
- `POST /api/finance/expenses`:
  - Caja: `{"operationId":"...","sucursalId":"...","origen":"CAJA","turnoId":"...","monto":"75.00","descripcion":"Artículos de limpieza","categoria":"Limpieza"}`.
  - Cuenta externa: `{"operationId":"...","sucursalId":"...","origen":"CUENTA_FINANCIERA","cuentaFinancieraId":"...","monto":"250.00","descripcion":"Electricidad","documentoReferencia":"TRANSFERENCIA-123"}`.
- `GET /api/finance/expenses?sucursalId=...`, `GET /api/finance/expenses/:id`.
- Un gasto desde caja inserta **un `GastoOperativo` + un `MovimientoCaja` EGRESO** con `gastoId` único, en una sola transacción. Reutiliza `CashStore.shiftTx` de PAY-A dentro de la transacción, verifica turno propio, sucursal, día operativo, fondos y permisos.
- Un gasto desde cuenta financiera inserta **un `GastoOperativo` + un `MovimientoFinanciero` negativo** `GASTO_OPERATIVO`, sin movimiento de caja. Exige cuenta activa, sucursal/moneda coincidente y comprobante. Índice parcial de DB impide doble asiento financiero por gasto.
- Operaciones `SERIALIZABLE`, reintentos de conflictos transitorios, registro de auditoría y outbox; fallos revocan íntegramente la operación. No se registra una salida bancaria real: el gasto indica pago externo declarado, pendiente de conciliación bancaria.
- Solo `tipo=OPERATIVO` para esta ruta: compras inventariables y pagos a proveedores siguen en PUR-A/INV-B.
- Permisos: `finance.expenses.read`, `finance.expenses.create`. `SUPER_ADMIN` los obtiene con el `seed`.

## Fase 3: imputación de operaciones externas PAY-A / PUR-A

**Estado: implementación para revisión CI y pruebas DEV; NO es conciliación bancaria.**
El usuario del POS no atraviesa pantallas financieras adicionales. La imputación automática ocurre en la transacción de confirmación si ya se conoce la cuenta; los casos sin cuenta quedan visibles únicamente en gestión financiera.

- `GET /api/finance/reconciliation/pending?sucursalId=...&sourceType=PAGO|PAGO_PROVEEDOR|REEMBOLSO_PAGO&page=1&limit=20`: lista **paginada de operaciones externas confirmadas**, con estado `PENDIENTE_CUENTA` o `REGISTRADO`. El paginado es sobre las operaciones elegibles, no exclusivamente sobre las pendientes; la UI puede mostrar ambos y filtrar su página, sin cargar millones de registros.
- `POST /api/finance/operation-intents` `{"sucursalId":"...","accion":"FIN_EXTERNAL_POST"}`: intención segura del servidor al abrir el formulario de imputación financiera. El usuario no escribe el identificador.
- `POST /api/finance/reconciliation/post` `{"operationId":"FIN:...","sucursalId":"...","sourceType":"PAGO","sourceId":"...","cuentaFinancieraId":"..."}`: en una sola transacción revisa el origen y los permisos, registra un único asiento firmado en la cuenta de esa sucursal y deja auditoría/outbox.
- Un `PAGO` externo de PAY-A produce **+monto**; un `PAGO_PROVEEDOR` confirmado produce **-monto**; un `REEMBOLSO_PAGO` con referencia verificada produce **-monto** en la misma cuenta del cobro original.
- No se imputan cobros/pagos en `EFECTIVO` en cuentas financieras externas, tampoco pagos pendientes/rechazados. Las transferencias PAY-A requieren intento `CONFIRMADO`, las tarjetas código de autorización y otros medios referencia verificable.
- PUR-A acepta un campo **opcional** `cuentaFinancieraId` en `POST /api/purchases/payments`. Si se proporciona, el pago externo crea el débito bancario **automáticamente durante su confirmación**, sin un segundo clic. Si no se proporciona, el pago sigue su flujo normal y FIN-A lo reporta como `PENDIENTE_CUENTA` para vinculación administrativa posterior. Para efectivo nunca se permite usar `cuentaFinancieraId`.
- La migración `20261028235000_fin_a_external_ledger_unique` garantiza `UNIQUE` sobre (`referenciaTipo`,`referenciaId`) cuando proviene de `PAGO`, `REEMBOLSO_PAGO` o `PAGO_PROVEEDOR`. No existe posibilidad de generar dos asientos del mismo origen en diferentes cuentas.
- Permisos: `finance.reconciliation.read`, `finance.movements.post` (sin otorgarlos automáticamente a cajeros). `saldoRegistrado` **no** indica conciliación con estados bancarios; la respuesta `conciliadoBanco:false` es deliberada.
- **Rutas automáticas PAY-A por método y sucursal**: `GET /api/finance/routing?sucursalId=...` y `PUT /api/finance/routing` con `operationId` emitido usando `FIN_ROUTING_UPSERT`. Las rutas son de uso administrativo, con permisos `finance.routing.read` y `finance.routing.manage`, y se guardan en `RutaFinanciera` (migración `20261029002000_fin_a_payment_routing`). Una ruta activa y válida para `TARJETA`, `TRANSFERENCIA` u `OTRO` permite a PAY-A contabilizar automáticamente un `PAGO` confirmado al producirse el cobro, **sin otra interacción del cajero**. Un reembolso externo se acredita negativamente en la misma cuenta que el cobro original, si este ya está imputado. Si falta ruta o está inválida, el cobro permanece correcto y aparece como pendiente de imputación en FIN-A; jamás se inventa el destino. La ruta no sustituye comprobación de extractos bancarios.
- No se permite configurar `EFECTIVO` como ruta financiera, ni usar `TARJETA_EMPRESA` como destino de cobros de clientes. PAY-A conserva su caja.
- Los pagos antiguos no se imputan retroactivamente en bloque al activar una ruta; quedan en gestión financiera con procedencia auditada.

## Integraciones y límites
- **PAY-A**: caja y turnos, cobros y reembolsos. FIN-A no abre caja ni emite un movimiento manual paralelo. La operación usa la misma transacción para el gasto y su caja.
- **PUR-A**: facturas y pagos a proveedores permanecen allí. No registrar adicionalmente un GastoOperativo por esos pagos. Integración de pagos externos confirmados con asientos financieros está pendiente.
- **INV-B / SUP-A**: stock/valoraciones y traslados no se registran como gastos operativos.
- **DEL-A / REP-A**: futuras liquidaciones e informes consumirán saldos y referencias del registro único.

## Pendientes para completar el bloque FIN-A
- [EN PROGRESO] Imputación sin duplicados de PAY-A/PUR-A/reembolsos; pendiente confirmación DEV, pagos históricos y conciliación contra extractos bancarios.
- Correcciones/reversas auditadas (sin modificar retroactivamente el registro).
- Vista previa y cierre inmutable por sucursal y fecha operativa; hora de corte y zona horaria.
- Prueba CI, migraciones sobre PostgreSQL DEV y Postman, idempotencia concurrente, permisos restringidos por sucursal.
- No mergear PR #12 hasta que estos puntos estén implementados y verificados.

## Despliegue DEV
1. Revisar `git status` antes de cambiar de rama; conservar cambios locales en Auth/PUR-A no relacionados.
2. Confirmar `DATABASE_URL` y `DIRECT_URL` de DEV.
3. `npm run prisma:deploy`, `npm run prisma:seed`, `npm run build`, `npm test`, `npm run test:e2e`.
4. Ejecutar la nueva colección Postman FIN-A Fase 2. La colección antigua F00–F08 de Fase 1 usa `claveOperacion` y debe reemplazarse.
