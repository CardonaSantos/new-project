# Gastro Core DEL-A / D3 — Pruebas financieras en PostgreSQL DEV

**No ejecutar contra producción.** Esta colección crea clientes, órdenes DELIVERY, pagos, entradas en caja y un asiento financiero de plataforma. Utilizar datos sintéticos y una cuenta financiera **DEV**; ningún dinero real queda confirmado por esta prueba.

## 1. Requisitos y comandos PowerShell
```powershell
git status
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
# ESTA FASE SÍ AGREGA UNA MIGRACIÓN Y NUEVOS PERMISOS EN SEED.
# Confirma primero DATABASE_URL y DIRECT_URL = PostgreSQL DEV y respaldo disponible.
npm run prisma:status
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```
No usar `prisma db push`, `migrate reset` ni aplicar migración a producción desde la estación de pruebas. Después de esta aplicación inicial, las iteraciones TypeScript normales **no** requieren Prisma otra vez.

## 2. Variables de Postman
Importar `Gastro_Core_DEL_A_D3_Settlements.postman_collection.json` desde esta carpeta.

| Variable | Obtenerla |
| --- | --- |
| `baseUrl` | `http://localhost:3000` (sin /api) |
| `token` | JWT SUPER_ADMIN de DEV |
| `sucursalId` | Sucursal DEV existente |
| `courierId` | Usuario.id activo; puede ser el mismo SUPER_ADMIN DEV |
| `varianteId` | Variante PREPARADO vendible en sucursal DEV con precio **22.00** para esta colección |
| `turnoCajaId` | Turno **abierto actual** de una caja DEV de la misma sucursal |
| `bankAccountId` | Cuenta financiera FIN-A tipo BANCO/EFECTIVO_EXTERNO, activa, de la sucursal y misma moneda (GTQ) |
| `runId` | Vacía en primera ejecución; conservar para probar idempotencia. Eliminar para otra batería completa |

Los GET 00 y 01 muestran turnos y cuentas financieras. Si no existe turno, usar PAY-A `GET/POST /api/cash/registers` y `POST /api/cash/shifts`; crear un turno solo en DEV. Si no existe cuenta bancaria, usar el flujo FIN-A `/api/finance/operation-intents` seguido de `/api/finance/accounts`; **no** inventar ID ni utilizar la cuenta financiera de producción. El usuario debe tener también `cash.manage` y `finance.movements.post`.

## 3. Ejecución
- Ejecutar **00–28 y 13b** en secuencia. Son 30 solicitudes. El escenario courier crea una orden y entrega, registra un pago `recibidoPorRepartidor=true` sin `turnoId` y verifica que no se ingresó ese efectivo a caja inmediatamente.
- 12 agrupa ese Pago en liquidación ABIERTA. 13 intenta cerrar con Q21 de Q22 y debe devolver **409**, sin MovimientoCaja; 13b registra la diferencia Q1 con motivo, conservando estado ABIERTA. 14 recibe físicamente Q22 en un turno activo y registra **un único** MovimientoCaja. 15 reintenta y debe devolver el mismo ID de movimiento, no uno nuevo.
- 18 crea canal DEV sintético. 19–22 crean y completan orden DELIVERY de origen PLATAFORMA. 23 reconoce bruto Q22, comisión Q2 y neto Q20. FIN-A escribe un único `MovimientoFinanciero` por Q20, no Q22. 24 reintenta, 25 lee detalle y 26 busca asiento en FIN-A. 27 confirma que PAY-A reconoció un único Pago bruto y 28 verifica que FIN-A no lo ofrece como cobro bancario pendiente.
- El bruto de plataforma se reconoce **una vez** como `Pago` en PAY-A, sin turno y sin ingreso a caja; nunca ejecutar PAY-A normal para cobrar esas cuentas por segunda vez. El neto solo se reconoce en FIN-A mediante `LIQUIDACION_CANAL`.
- El recibo externo es confirmación **manual del operador con permiso financiero** y referencia única, **no verificación automática de API bancaria**. FIN-A conserva su conciliación bancaria posterior. No ejecutar con transferencias bancarias reales a menos que se comprueben externamente.
- Si el periodo operativo está cerrado, el turno es antiguo o faltan permisos, **409/403 esperados**. Abrir turno del día actual; no modificar ni reabrir cierres anteriores.
- No editar manualmente Pago, MovimientoCaja o MovimientoFinanciero en Prisma Studio para hacer pasar el ensayo.

## 4. Seguridad y restricciones actuales
- El cobro de repartidor lo reconoce PAY-A en la transacción de D3, sin MovimientoCaja. El reembolso de ese Pago no está permitido hasta que el efectivo se liquide, para no sacar efectivo que aún no llegó a caja.
- D3 bloquea reembolsos directos de Pago de plataforma: requieren una **reversa financiera conciliada**. Este flujo excepcional se revisará en D4; no burlar el bloqueo modificando SQL manualmente.
- El estado `ENTREGADA` no cierra por sí solo la orden ni genera Venta. PAY-A mantiene el requisito de preparación/comandas para cierre ordinario. La colección utiliza `enviarCocina:false` y solo verifica reconocimiento monetario, no finalización de cocina.
- Si se detecta faltante, el registro de discrepancia permite dejar constancia auditada, **no lo da por liquidado ni crea caja**. La liquidación permanece ABIERTA hasta recibir el efectivo esperado. Sin segundo aprobador.
- Se mantiene la validación multisucursal y de roles restringidos como cobertura futura de D4; no marcarla como probada en DEV solo porque CI está verde.

**Al terminar:** enviar únicamente los JSON relevantes, status HTTP y resumen de Postman (sin JWT, datos personales, claves de cuentas bancarias ni referencias reales). PR #14 sigue DRAFT.
