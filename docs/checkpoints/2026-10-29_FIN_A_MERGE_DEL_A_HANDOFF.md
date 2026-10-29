# GASTRO CORE — CHECKPOINT AUTORITATIVO DE CONTINUIDAD
## FIN-A fusionado; siguiente sprint DEL-A (Clientes, Delivery y Liquidaciones)
**Fecha del checkpoint:** 2026-10-29 (Guatemala).
**Repositorio único de backend:** https://github.com/CardonaSantos/new-project
**Base verificada antes de escribir este documento:** main @ 4cfb6c5f0fdf06bbe868ceae5ef2296662be7e07
**PR FIN-A:** https://github.com/CardonaSantos/new-project/pull/12 — MERGED, squash a main.
**CI de main tras merge:** https://github.com/CardonaSantos/new-project/actions/runs/40932201881 — SUCCESS.
**CI del último HEAD previo al merge:** https://github.com/CardonaSantos/new-project/actions/runs/40928096769 — SUCCESS: 156 pruebas unitarias, 63 HTTP/E2E, build/Prisma validate y smoke PostgreSQL.
**Issue del siguiente sprint:** https://github.com/CardonaSantos/new-project/issues/13
**Estado exacto del nuevo sprint:** PLANIFICADO, **NO SE HA IMPLEMENTADO DEL-A**, no existe rama/PR de DEL-A creados por este checkpoint.
**Regla de actualidad:** verificar SIEMPRE HEAD/CI/PR/rama/schema/seed al retomar; los datos de fecha fija son histórico, no estado automático del futuro.

---

## 0. EMPEZAR AQUÍ EN EL SIGUIENTE CHAT (LECTURA EN 2 MINUTOS)

El proyecto Gastro Core es un backend real de restaurante, cafetería y POS multisucursal, en NestJS 12 + TypeScript 6 ESM + Prisma 7 + PostgreSQL. El frontend nuevo de Angular es un plan independiente; **no** afirmar que la nueva UI esté implementada o integrada.

Se construyeron y fusionaron a main **12 bloques funcionales** más CoreModule: Auth, Users, Organization, Media, Inventory, Catalog, Recipes, Orders, Payments, Purchases, Supply y Finance. Los 12 corresponden a **12 de 16 bloques planificados** (75% del número de bloques, no del trabajo o cobertura). La matriz histórica de 26 macroflujos queda en **21 implementados** (01 a 21) y **5 futuros**: DEL-A #22 Delivery, RSV-A #23 Reservaciones, DEL-A #24 Clientes/direcciones, QR-A #25 Autoservicio y REP-A #26 Reportería. Esta cuenta es una CONVENCIÓN DEL ROADMAP; no sustituye pruebas funcionales ni auditoría formal.

El último módulo fue **FIN-A** (cuentas, gastos, integraciones externas PAY-A/PUR-A, rutas financieras, reversas, extractos y conciliación, cierre por día operativo). Se fusionó PR #12 por squash. No reabrir FIN-A ni volver a aplicar modificaciones ya integradas salvo evidencia de problema concreto.

**Ahora iniciar DEL-A, cubriendo dos macroflujos juntos: #24 Clientes/direcciones y #22 Delivery/repartidores/canales/liquidaciones.** El esquema ya contiene modelos; NO existe aún CustomersModule o DeliveryModule en AppModule ni API HTTP de esas funciones. Es necesario diseñar las fronteras con Orders, Payments y Finance antes de crear endpoints, especialmente el efectivo contra entrega y la liquidación sin doble cobro.

Ruta de trabajo acordada:
1. Confirmar main, CI y migraciones; recuperar este checkpoint e Issue #13.
2. Crear rama nueva a partir de main, sugerida: feat/del-a-customers-delivery (revisar si ya existe antes de crear).
3. Desarrollar incrementalmente **D1 Clientes/direcciones**, **D2 Entregas**, **D3 Cobros/liquidaciones**, **D4 pruebas/endurecimiento**, manteniendo hexagonalidad, seguridad, idempotencia y auditoría.
4. En cada fase: cambios de código + migración aditiva si procede + seed/permisos + unit/HTTP + GitHub Actions, colección Postman DEV y revisión de respuestas reales.
5. Mantener PR DRAFT hasta validación real DEV; solo hacer merge cuando el usuario lo autorice y estén verdes las pruebas del HEAD. Documentar un checkpoint fresco después de cada fase.

**Mensaje corto de recuperación al final de este documento.**

## 1. FUENTES Y PRECEDENCIA (NO CONFIAR EN UN RESUMEN OBSOLETO)

Orden de verdad al retomar:
1. HEAD actual de GitHub main, PRs/branches/issues y GitHub Actions, schema y migraciones realmente en main.
2. Código: src/app.module.ts, prisma/schema.prisma, prisma/seed.ts, controladores, DTOs, puertos, servicios, stores, tests y README.
3. Este documento, como CHECKPOINT temporal del estado comprobado a 2026-10-29, y Issue #13 para plan DEL-A.
4. Documentos previos: docs/checkpoints/2026-10-28_SUP_A_ESTADO_Y_CONTINUIDAD.md, docs/fin-a/DISENO_FUNCIONAL_INTEGRADO_V1.md y el archivo externo de proyecto GASTRO_CORE_GUIA_MAESTRA_DESARROLLO(3).md.

**ADVERTENCIA DE VIGENCIA:** la guía maestra externa tiene corte 2026-10-16: dice 8/16 bloques, 115 modelos, 11 migraciones y PAY-A como próximo. YA ESTÁ DESACTUALIZADA. No volver a aquella etapa. Los checkpoints intermedios SUP-A y FIN-A también describen estados de sus fechas; prevalece GitHub actual más este documento.

En main verificado:
- 124 modelos Prisma; 20 directorios con migration.sql.
- 13 NestJS Modules registrados en AppModule = 12 módulos funcionales + CoreModule técnico.
- .github/workflows/ci.yml corre validación/compilación/tests y smoke de migraciones PostgreSQL. Último push a main en 4cfb6c5 (run 40932201881) aprobado.
- Stack técnico: Node según package.json engines >=22.22.3 <23 O >=24.15.0; NestJS 12, Prisma 7, Postgres, @prisma/adapter-pg, Vitest, class-validator/class-transformer, JOSE/JWT, Argon2id, SDK Spaces S3.
- ESM: imports relativos en TypeScript terminan en .js; no romper el compilador ni DI.
- API prefijo global /api, SIN /v1. Documentación de rutas REAL en controladores y Swagger; rutas propuestas de abajo NO están publicadas aún.
- Locale GTQ y America/Guatemala configurables por sucursal, incluido horaCorteOperativo (por defecto 04:00).
- No se ha confirmado el deployment de código nuevo al entorno del usuario solo por pasar CI. PR merge y GitHub CI NO ejecutan SQL en su PostgreSQL local.

## 2. HISTORIAL DEL DESARROLLO YA TERMINADO

### 2.1 Inventario por bloques funcionales (12/16)

| Bloque | Responsable | Estado en main | Qué NO debe duplicar DEL-A |
| --- | --- | --- | --- |
| 01 Auth | AuthModule | Implementado | sesiones, JWT, refresh, guards |
| 02 Users | UsersModule | Implementado | usuarios, perfiles, RBAC/roles |
| 03 Organization | OrganizationModule | Implementado | sucursales, configuración, dispositivos |
| 04 Media | MediaModule | Implementado | subida/almacenamiento de evidencias |
| 05 Inventory | InventoryModule | INV-A + INV-B | Kardex, stock, lotes, costos, traslados |
| 06 Catalog | CatalogModule | CAT-A | menús, productos, extras, precios |
| 07 Recipes | RecipesModule | REC-A | receta/versionado/producción/consumo |
| 08 Orders | OrdersModule | ORD-A | órdenes, cuentas, mesas, comandas, preparación |
| 09 Payments | PaymentsModule | PAY-A | caja, pagos, reembolsos, venta interna y recibos |
| 10 Purchases | PurchasesModule | PUR-A | proveedores, OC, recepciones, facturas, pagos |
| 11 Supply | SupplyModule | SUP-A | requisiciones y abastecimiento/traslados |
| 12 Finance | FinanceModule | FIN-A | fondos/cuentas, movimientos, gastos, conciliación y cierre |

CoreModule (auditoría, DB, resiliencia) **no** se cuenta entre esos 12.
Módulos funcionales pendientes: DEL-A, RSV-A, QR-A, REP-A.

### 2.2 PRs / evidencias clave

- ORD-A: órdenes, mesas, Kitchen/KDS lógico y consumo de receta/inventario probado anteriormente; los checkpoints anteriores contienen su detalle.
- PAY-A: turno/caja, pagos mixtos, efectivo/externos, idempotencia, registro Venta interno y reembolsos. Punto crucial: su contrato actual de cobro normal pide turnoId incluso cuando existen campos de repartidor; no usarlo directamente para inventar cobros de repartidor.
- PUR-A: PR #8 integrado anteriormente; 47 respuestas CORE de compras y correcciones según histórico; módulos existentes y smoke.
- SUP-A: PR #9 integrado anteriormente; la guía de SUP-A antigua quedó superada. Control del tránsito, requisiciones y creación de propuestas PUR-A sin duplicar INV-B.
- FIN-A: PR #12 https://github.com/CardonaSantos/new-project/pull/12 , MERGED en main por squash como commit 4cfb6c5f0fdf06bbe868ceae5ef2296662be7e07; el HEAD anterior al squash fue bb36b0e6ece28a2a321cd7d48fbd6321d27ba887. **72 commits en el PR antes de squash**. CI premerge run 40928096769 SUCCESS (156 unit/63 HTTP + Postgres smoke), main postmerge run 40932201881 SUCCESS.

### 2.3 FIN-A — alcance REAL fusionado

1. Cuentas financieras por sucursal, saldo **registrado** (NO saldo bancario real conciliado), movimientos paginados.
2. Gastos operativos desde caja o desde cuenta financiera: egreso único de caja o asiento financiero negativo, referencias obligatorias y auditoría/outbox.
3. Integraciones PAY-A/PUR-A: asiento externo PAGO positivo, REEMBOLSO_PAGO negativo, PAGO_PROVEEDOR negativo; rutas automáticas por sucursal/método cuando configuradas, sin inventar banco para efectivo. Imputación diferida de origen confirmado.
4. Idempotencia segura: intenciones FIN:uuid emitidas por el servidor, ligadas usuario/sucursal/acción, hashes de payload, 409 ante reutilización incompatible, transacciones SERIALIZABLE y protecciones únicas PostgreSQL.
5. Fase 4: preview GET finance/closing/preview; POST finance/closing; GET cierre persistido. Usa zona horaria/corte de la sucursal, caja, cobros, ventas, pagos a proveedor, gastos, netos del ledger y reversas. Rechaza cierre del día actual, con turnos o pedidos abiertos y segundo cierre con nueva intención; el mismo intento repite resultado.
6. Importación de extracto sintético/real desde líneas con clave externa única por cuenta; conciliación 1:1 contra asientos con misma cuenta y monto; deshacer con motivo; reversa firmada de GASTO_OPERATIVO bancario (no borrar histórico, no revertir directamente transacciones de PAY-A/PUR-A).
7. Endurecimiento antes del merge: verificación de referencia de documento de origen y fecha de compensación de 0 a 14 días; divergencia = 409. Excepción requiere finance.statements.override + justificación de >=20 caracteres, auditada y almacenada como EXCEPCION_AUTORIZADA; coincidencias normales como VERIFICADA. Dos columnas nuevas opcionales mantienen registros legados con validacionReferencia=NULL.
8. Guard transversal del día operativo cerrado: bloquea aperturas de nuevos turnos, nuevas mutaciones de caja, nuevos asientos de PAY-A/PUR-A/FIN-A, confirmaciones de pago proveedor aun sin cuenta financiera y reembolsos; permite consulta y conciliación posterior sin alterar importes de origen.

**Matiz:** no afirmar conciliación bancaria con extracto íntegro: la prueba DEV fue con líneas sintéticas. Tampoco prometer que correcciones posteriores a cierre están permitidas sin la política contable; comprobar guard al integrar DEL-A.

### 2.4 DEV Postman FIN-A — qué está validado manualmente

El usuario probó contra su PostgreSQL de DESARROLLO (respuestas compartidas en conversación):
- Gastos desde banco: -Q2.00, reversa +Q2.00, mismo intent idempotente, sin duplicación; ledger conserva ambos asientos.
- Extracto sintético +Q1.00: importación idempotente, match 1:1, unmatch y rematch. Se probó 409 para asiento ya vinculado; tras escoger asiento pendiente funcionó. Esto fue ANTES del endurecimiento de referencia/fecha.
- Negativas: intento de reversa directa de PAY-A devuelve 409; monto cero en extracto devuelve 400.
- Cierre de sucursal de prueba (ID en DEV: cmv8p4k3x0001u4v4xor2zgqu) para fecha operativa 2026-10-28, corte 04:00 America/Guatemala:
  * preview: 0 turnos abiertos; 0 órdenes abiertas; diferencia arqueo Q0; egresos caja Q85; 2 pagos proveedor total Q17.40; 2 gastos Q325; ledger neto -Q250.
  * POST: cierre ID cmvtu2t7w000zrsv4ry7uqqie; cerradoEn 2026-10-29T17:45:01.292Z.
  * Reintento con mismo operationId: mismo cierre y snapshot.
  * GET detalle: mismo cierre persistido.
  * Nuevo operationId FIN:7061b735-ddf3-4618-b4a1-0515cb21e1ba, mismo día: HTTP 409, mensaje 'El día ya está cerrado'.
- Confirmación de que el backend levantaba en el entorno del usuario después del merge fue reportada por él. **NO** equivale a todas las pruebas DEV del nuevo endurecimiento; CI cubrió estos cambios.
- La colección antigua de Phase 4 tiene variables runKey que deben inicializarse y reconciliaciones sintéticas antiguas que pueden estar marcadas validacionReferencia NULL. NO volver a ejecutarla en bloque sobre datos que ya cerraron.

**Pendientes POST-MERGE fuera del alcance de DEL-A que registrar sin olvidar:** verificar nueva política de banco contra un extracto verídico, usuario restringido y otra sucursal en DEV; revisión de conciliaciones legadas NULL y supervisión de excepciones; pruebas de concurrencia HTTP real de pagos/finanzas; estos son QA pendientes, no un módulo FIN-A no integrado.

## 3. ROADMAP EXACTO RESTANTE: 4 BLOQUES, 5 MACROFLUJOS

| Prioridad | Bloque | Macroflujos | Estado | Dependencia |
| --- | --- | --- | --- | --- |
| 1 | DEL-A Clientes, entregas y liquidaciones | #24 clientes/direcciones y #22 delivery/canales | PLANIFICADO: ahora | ORD-A/PAY-A/FIN-A/Users |
| 2 | RSV-A Reservaciones | #23 reservas | Futuro | mesas ORD-A y clientes DEL-A |
| 3 | QR-A Autoservicio y QR | #25 autoservicio | Futuro | CAT-A/ORD-A/PAY-A, sesiones seguras |
| 4 | REP-A Reportería consolidada | #26 reportes | Futuro | ledger/caja/ventas/inventario/delivery |

**Excluidos expresamente del conteo 16/26:** facturación electrónica tributaria FEL en Guatemala (Venta es un REGISTRO INTERNO, no factura FEL); impresoras térmicas, KDS físico, cajones de dinero, terminales de tarjeta, periféricos y otras integraciones hardware. No abordar antes que los módulos pendientes salvo nueva decisión expresa.

**UI:** la nueva UI de Angular para Gastro Core es un proyecto planificado independiente. El backend entrega API con contratos para su futura UI; no construir componentes Angular en el sprint DEL-A salvo que el usuario modifique el alcance.

## 4. PLAN DE DEL-A Y SUS FRONTERAS (USAR EN PRÓXIMO CHAT)

**Objetivo de negocio:** usar el mismo motor comercial ORD-A y el mismo PAY-A/FIN-A para atender pedidos de reparto y plataformas externas, identificar al cliente y dirección, despachar, entregar y liquidar el dinero una sola vez, sin incrementar falsamente ingresos, duplicar stock ni crear ventas adicionales.

**Ownership recomendado:**
- Nuevo contexto customers (nombre de módulo a validar con patrón existente): es dueño de Cliente y DireccionCliente.
- Nuevo contexto delivery: es dueño de CanalExterno, Entrega, LiquidacionRepartidor(/Linea), LiquidacionCanalExterno(/Linea).
- Orders conserva Orden, Cuenta, estados de preparación, precios y cocina. El hecho de que modalidad DELIVERY ya exista en Orden NO significa que la entrega esté creada.
- Payments conserva Pago, IntentoPago, ReembolsoPago, Venta, turno/caja y su cálculo; **Delivery no debe insertar directamente Pago/MovimientoCaja si existe un caso de uso PAY-A**. Diseñar coordinación transaccional mediante puertos/servicios apropiados.
- Finance conserva CuentaFinanciera, MovimientoFinanciero, reconciliación bancaria y CierreOperativo, incluidos guards de fecha local.
- Media conserva almacenamiento, pero delivery puede poseer la relación de evidencias si se añaden.

Arquitectura: domain (reglas puras sin Nest/Prisma) -> application (casos de uso) -> application/ports (contratos) -> infrastructure/prisma (transacciones, adaptadores, proyecciones) -> presentation/http (DTO y controller) -> Nest module (DI). No meter Prisma en controllers, ni duplicar tablas o paquetes. ESM con imports .js. El código de ORD/PAY/PUR/FIN ya usa una arquitectura hexagonal pragmática; imitarla, no rehacer todos los módulos.

### 4.1 Modelos existentes en schema (verificados en main a fecha del checkpoint)

**Cliente:** id, nombre, nit?, telefono?, email?, notas?, activo, creadoEn. Relacionado con DireccionCliente, Orden, Venta, Reserva. **No tiene sucursalId**: política de privacidad/lectura por sede NO se resuelve solo filtrando una columna inexistente.

**DireccionCliente:** id, clienteId, alias?, direccion, referencia?, latitud?, longitud? con Decimal(10,7), principal bool. Se relaciona con Entrega. **No tiene columna activa ni creadoEn**; decidir si hacen falta en migración aditiva.

**Orden:** incluye modalidad MESA/MOSTRADOR/PARA_LLEVAR/DELIVERY y origen CAJA/MESERO/QUIOSCO/QR/WEB/TELEFONO/PLATAFORMA, clienteId opcional, sucursalId, estado ABIERTA/CERRADA/CANCELADA, precio/snapshot, cuenta, cocina y consumo. Una Orden puede tener UNA Entrega (relación inversa 1:1).

**Entrega:** id, ordenId @unique, direccionId?, direccionTexto, referenciaDireccion?, telefonoContacto?, repartidorId? (FK Usuario), canalExternoId?, referenciaExterna?, estado PENDIENTE/EN_REPARTO/ENTREGADA/CANCELADA, costoEnvio Decimal, cobrableContraEntrega Decimal, enRepartoEn?, entregadaEn?, nota?. Índices (repartidorId, estado) y (canalExternoId, referenciaExterna). No existe historial de eventos de entrega/ evidencias explícitas en schema; evaluar migration aditiva.

**CanalExterno:** id, codigo @unique, nombre, activo. No indica cuenta de pago ni porcentaje de comisión per se; liquidación registra comisiones.

**LiquidacionRepartidor:** id, repartidorId, sucursalId, turnoCajaId?, estado ABIERTA/CERRADA, totalEsperado, totalEntregado, creadaEn, cerradaEn; relación a MovimientoCaja única por liquidacionRepartidorId.
**LiquidacionRepartidorLinea:** id, liquidacionId, entregaId, pagoId @unique y monto. La unicidad de pagoId evita liquidarlo dos veces; NO sustituye una transacción concurrente segura.

**LiquidacionCanalExterno:** id, canalId, cuentaFinancieraId?, periodoInicio/Fin (DATE), referencia?, totalBruto, totalComision, totalNeto, recibidaEn?, creadaEn. **No tiene sucursalId**: establecer alcance multisucursal a través de Entrega -> Orden o añadir sucursalId en migración segura si se necesita; no asumir alcance solo por canal global.
**LiquidacionCanalExternoLinea:** liquidacionId, entregaId @unique, importeBruto, comision, importeNeto. Un entrega de canal puede asociarse a una sola línea para evitar doble liquidación.

**Pago:** metodo EFECTIVO/TARJETA/TRANSFERENCIA/OTRO, turnoId?, referencia?, codigoAutorizacion?, monto, recibidoPorRepartidor bool default false; cuentaId -> Orden; cobrados por PAY-A. **El cobro normal POST /api/accounts/:id/payments requiere turnoId en DTO**: NO simular que este endpoint admite libremente cobro en efectivo en calle. Nuevo caso de uso en PAY-A a diseñar.
**MovimientoCaja:** liquidacionRepartidorId? @unique. Evitar crear un MovimientoCaja por pago de repartidor al registrar Pago y luego otro al liquidar: una sola entrada a caja al recibir dinero de repartidor.
**CierreOperativo:** (sucursalId,fechaOperativa) UNIQUE. Todo ingreso efectivo nuevo debe comprobar el guard de período antes de escribir.

**Enum confirmado:** EstadoEntrega = PENDIENTE, EN_REPARTO, ENTREGADA, CANCELADA. EstadoLiquidacion = ABIERTA, CERRADA. No inventar estados como ASIGNADA, LIQUIDADA o ENTREGADA_PARCIAL sin primero acordar SQL/contrato y transiciones.

### 4.2 FASE D1 — Clientes y direcciones (PRIMERA TAREA A IMPLEMENTAR)

Objetivo: CRUD seguro sin pérdida de relaciones; búsqueda paginada; dirección principal opcional/única por cliente con concurrencia controlada, y soporte para delivery/reservas.

Pasos:
1. Leer schema Cliente/DireccionCliente y los usos actuales de clienteId en Orders/Payments/Reservations. Revisar si hay clientes DEV vinculados y si existen IDs compartidos entre sucursales.
2. Establecer política de alcance PRIVACIDAD. **PROPUESTA**: un perfil Cliente es entidad global comercial, pero consulta/modificación requiere permiso de customers.* y alcance explícito basado en participación en órdenes/reservas de la sucursal, o permisos globales aprobados; no dar acceso indiscriminado a todas las sedes. Si un cliente nunca tuvo pedido, definir explícitamente su propiedad/visibilidad. Preferir nueva relación de contexto/sucursal si lo exige la regla, no fugas de PII.
3. Diseñar DTO estrictos: nombre, teléfono, email, NIT opcional con reglas locales, alias/dirección/referencia, latitud-longitud validadas Decimal sin usar floats para cálculo de dinero; no inventar coordenadas ni exigir mapa/geocodificación.
4. Endpoints **PROPUESTOS, NO IMPLEMENTADOS**: GET/POST /api/customers, GET/PATCH /api/customers/:id, GET/POST /api/customers/:id/addresses, PATCH /api/customers/:id/addresses/:addressId, POST /api/customers/:id/deactivate y opcional selección de principal. El path definitivo lo decide el diseño antes de codificar; no dar estos contratos como reales.
5. Crear CustomerService+ports+CustomerStore+DTO/controller+Module si justificado; mantener la lectura autenticada y paginación, no filtrar datos sensibles innecesarios. Alta/baja idempotente, auditoría/outbox; no borrar cliente con historial de órdenes o reservas.
6. Seed de permisos propuestos customers.read, customers.manage y granularidad por sede; SUPER_ADMIN según política seed, sin concesiones silenciosas a roles operativos.
7. Migración(s) ADITIVAS solo si se requiere actualizarAt, soft-delete dirección, vinculaciones sucursal/cliente o índice único de dirección principal. Revisar SQL con datos ya existentes; evitar romper clientes del esquema.
8. Unit/HTTP/Prisma smoke: crear cliente, edición, búsqueda, direcciones, principal única, duplicado/reintento, validaciones, usuarios sin permiso y cambio de sucursal, cliente desactivado no asociado a orden nueva.
9. Colección Postman DEV con variables aisladas y asserts automáticos; compartir con usuario para ejecución y verificación de JSON. Cerrar D1 únicamente tras respuesta real, CI verde y documentar checkpoint.

**Criterio mínimo D1:** un cliente existente puede vincularse a una orden ORD-A y tiene su dirección segura, paginada y editable; usuarios no autorizados no consultan ni cambian PII de otra sucursal. No duplicar Cliente en cada entrega.

### 4.3 FASE D2 — Delivery, despacho y evidencia

Objetivo: una Entrega única asociada a una Orden modalidad DELIVERY, con snapshot de dirección para preservar historia aunque el cliente modifique su dirección.

Decisiones a diseñar/aceptar:
- Orden actual se crea mediante POST /api/orders y CreateOrderDto permite modalidad DELIVERY/clienteId, pero **no incorpora dirección de entrega**. Crear entrega en una operación separada después de crear orden puede dejar un pedido DELIVERY huérfano. Diseñar extensión orquestada en capa de aplicación para crear Orden+Entrega con transacción compartida o compensación segura; no llamar dos endpoints entre módulos que puedan dejar datos inconsistentes sin tratarlos.
- Validar direcciónId (si se proporciona) pertenece al cliente de la orden; snapshot obligatorio direccionTexto, contacto y referencia opcionales; ningún repartidor de una sucursal ajena.
- Estados iniciales mínimos: PENDIENTE -> EN_REPARTO -> ENTREGADA; CANCELADA solo bajo reglas explícitas y rol supervisor si ya salió, con motivo y sin borrar pagos/stock.
- Asignación/reasignación de repartidor; permisos repartidor para leer solo sus entregas y registrar acciones permitidas; ADMIN/gestor de delivery asigna.
- Preparación en ORD-A no se rehace; definir cómo EN_REPARTO se habilita con comandas listas y stock consumido; no descontar inventario al despachar por segunda vez.
- No permitir marcar ENTREGADA con intentos incorrectos/duplicados; evidencia opcional a diseñar, hash/referencia vía Media y evento auditado. Evitar ubicación GPS permanente, geotracking invasivo o datos innecesarios.
- CosteEnvio vs cobrableContraEntrega vs total Orden: definir qué forma parte de Cuenta/Precio/Descuento antes de registrar cobros; no ocultar costos ni inventar saldos.
- Endpoints **SOLO PROPUESTA**: POST /api/delivery/orders (orquestador seguro), GET /api/delivery?..., GET /api/delivery/:id, POST /api/delivery/:id/assign, POST /api/delivery/:id/dispatch, POST /api/delivery/:id/deliver, POST /api/delivery/:id/cancel, y GET /api/delivery/my-assignments.
- Concurrencia: versiones/optimistic guard o SERIALIZABLE; idempotencia para asignar, enviar, entregar, cancelar; auditoría/outbox y FK/índices.

**Criterio D2:** una orden delivery creada, enviada a cocina, preparada, asignada, despachada y entregada una vez; restricciones de sucursal/usuario/estado probadas. ORD-A mantiene única fuente de precio y consumo; Delivery únicamente la logística.

### 4.4 FASE D3 — Efectivo contra entrega y liquidaciones

Punto crítico del proyecto: **NO DUPLICAR EL COBRO NI EL INGRESO DE CAJA**.

1. **Efectivo recibido por repartidor**: modelo Pago ya tiene recibidoPorRepartidor bool y turnoId nullable. Pero flujo PAY-A de /accounts/:id/payments normalmente requiere turnoId y registra MovimientoCaja para EFECTIVO. Diseñar nuevo caso de uso autorizable en PAY-A (no escribir pago desde adaptador DEL-A arbitrariamente) que registre Pago de EFECTIVO recibido en calle asociado a Cuenta+Orden+Entrega, sin MovimientoCaja mientras el dinero no haya entrado físicamente a caja; un pago único y idempotente.
2. **Liquidación del repartidor**: seleccionar solo pagos EFECTIVO recibidosPorRepartidor=true, con su Entrega del mismo repartidor y misma sucursal, no liquidados. Crear LiquidacionRepartidor y líneas por pago, calcular totalEsperado Decimal; registrar entrega real de efectivo al turno de caja activo mediante **un solo MovimientoCaja INGRESO** relacionado por liquidacionRepartidorId @unique; no crear uno adicional por cada Pago. Controlar efectivo entregado menor/mayor, diferencias e incidencias con política y auditoría (no declarar liquidado si falta dinero sin excepción explícita).
3. Asegurar que cobros en banco/terminal se procesen por PAY-A/FIN-A una sola vez y no se liquidan como efectivo físico de repartidor; reembolsos pasan por PAY-A.
4. **Canales externos**: plataforma externa puede recaudar del cliente y transferir neto menos comisión; no registrar total bruto como segundo Pago. Entrega->CanalExterno->LiquidacionCanalExterno+Linea; totalBruto - totalComision = totalNeto, recibidaEn y cuenta financiera de misma moneda/sede. Valorar si falta sucursalId en LiquidacionCanalExterno; regla de múltiples sedes y reutilización canal.
5. Corte operativo local de FIN-A: antes de contabilizar recaudación en caja/finanzas, comprobar turno/día vigente no cerrado. Un depósito tardío debe quedar como ajuste reconocido en fecha actual con trazabilidad al reparto histórico, NO mutar un día previamente cerrado.
6. Idempotencia bajo reintento/concurrencia: unique Pago/LiquidacionLinea, unique MovimientoCaja.liquidacionRepartidorId y claves por operación. Auditar y emitir outbox.
7. Endpoints **PROPUESTOS**: GET /api/delivery/settlements/couriers/pending, POST /api/delivery/settlements/couriers, POST /api/delivery/settlements/couriers/:id/close, GET /api/delivery/channels, POST /api/delivery/channels/settlements, GET detalle/historial.
8. No ampliar los enum existentes sin justificación y migración, y conservar snapshots/contratos para reporting REP-A.

**Criterio D3:** dos entregas con un Pago de QX y QY cada una; el repartidor entrega Q(X+Y) a caja exactamente una vez, caja aumenta una vez, venta interna no se duplica; segunda liquidación del mismo Pago devuelve conflicto. Canal externo contabiliza comisión y neto exactos, sin doble cobro.

### 4.5 FASE D4 — Endurecimiento y QA

- Tests de dominio de estado, validez de dirección/cliente/orden, stock consumido una sola vez por ORD-A, evidencia, scopes multi-sucursal.
- Unit, DTO HTTP, DI real de módulos, migraciones PostgreSQL desde cero y actualización sobre esquema anterior.
- Postman DEV: operaciones nuevas con claves únicas, datos reales de sucursales/orden/cuenta/turno/usuario, asserts 200/201/400/403/404/409; asegurar que variables se inicializan al comenzar (evitar antiguo runKey vacío).
- Escenarios negativos: delivery sin modalidad DELIVERY, direcciones ajenas, repartidor inactivo/no adscrito a sucursal, entregas duplicadas por orden, despachar sin preparación, cancelación tras entrega, manipular otra sucursal, liquidación duplicada, distintos montos, cambio de día operativo, sin turno, fecha cerrada, reversas y fallos atómicos.
- Concurrentes: intento doble de cierre de repartidor (2 requests), asignación simultánea, movimiento de caja duplicado, reintentos de confirmación que solo producen 1 efecto.
- No exponer clientes/contactos en logs ni Postman públicos; no subir tokens JWT reales ni archivos de secretos al repositorio.
- Controles robustos para superadmin + usuario empleado restringido + repartidor asignado + sucursal ajena. Probar que un permiso global de lectura no suplante un permiso financiero de escritura.
- CI completa: npm run prisma:validate, npm run build, npm test, npm run test:e2e; verificar workflow/actions para el HEAD; PostgreSQL migration-smoke. Documentar qué sí se probó en DB DEV y qué no.
- Hacer PR (idealmente DRAFT) desde rama nueva, explicar cambios y checklist. NO fusionar ni borrar rama con CI fallando.

## 5. REGLAS PERMANENTES NO NEGOCIABLES

1. Hexagonal pragmática; frontera de controller limpia; no romper DI.
2. Authorization debe mirar el RECURSO REAL + sucursal, no confiar únicamente en sucursalId escrito por cliente; separa global admin de empleado local.
3. Seguridad de PII: redacción en logs/auditorías, mínimo dato personal y permisos específicos. No inventar una política de borrado completo que destruya trazabilidad contable.
4. Decimal para dinero, cantidades y comisiones; NEVER Number/float para cuentas. Rounding/currency explícitos.
5. Idempotencia y atomicidad: claveOperacion/OperacionIdempotente generada según convención del módulo, constraints UNIQUE en DB, SERIALIZABLE donde corresponde, auditoría + outbox. Retries no pueden duplicar Pago/Venta/Kardex/caja/liquidación.
6. Snapshot histórico de dirección, tarifas, comisiones y estados. No reescribir pasado desde CRUD actual.
7. Período financiero cerrado es barrera para nuevas contabilizaciones; posterior conciliación no cambia importes; evitar alterar cierre de días anteriores.
8. No gestionar inventario directamente desde Delivery: ORD-A/REC-A/INV-B son dueños del consumo.
9. Una experiencia simple para operador: no añadir pasos o confirmaciones redundantes; aprobar solo acciones verdaderamente riesgosas (cancelación/reembolso/ajuste).
10. Migraciones siempre aditivas y revisadas, no reset/deletes de datos DEV o PROD, no usar db push como sustituto de migrate; confirmar conexiones antes de seed/deploy.
11. No inventar HTTP status, modelos, endpoints, tests, CI o disponibilidad de herramientas. Marcar [PROPUESTA], [IMPLEMENTADO], [VALIDADO DEV], [PENDIENTE] de manera diferenciada.
12. Mantener compatibilidad razonable para futuro Angular, Swagger/DTOs consistentes y paginación en listados.

## 6. CONTRATOS HTTP YA PUBLICADOS — SOLO REFERENCIAS RELEVANTES

Verificar en controllers del HEAD, NO copiar ejemplos antiguos sin mirar versión:
- Auth: POST /api/auth/login, GET /api/auth/capabilities; JWT bearer, refresh cookie.
- ORD-A: GET/POST /api/orders, GET/PATCH /api/orders/:id; POST /api/orders/:id/lines, /send, /cancel, /close; mesas y cocina bajo /api/tables y /api/kitchen.
- CreateOrderDto incluye sucursalId, modalidad (incluye DELIVERY), origen (incluye TELEFONO y PLATAFORMA), clienteId?, lineas, enviarCocina? y claveOperacion. **NO acepta dirección en ese DTO** al 2026-10-29.
- PAY-A: GET /api/accounts/order/:orderId; POST /api/accounts/:id/payments; POST /api/accounts/order/:orderId/finalize; GET /api/accounts/:id; reembolso POST /api/payments/:id/refund; turnos GET/POST /api/cash/shifts y POST /api/cash/shifts/:id/close.
- Finance: POST /api/finance/operation-intents, GET /api/finance/accounts, GET/POST /api/finance/expenses; rutas/reconciliación, extractos y closing existentes.
- Permisos: GET /api/auth/capabilities, GET /api/permissions, endpoints administrativos de roles.

Para cada endpoint nuevo de DEL-A, documentar: permisos, datos de request, status real Nest, invariantes, idempotencia, events/outbox, errores 400/403/404/409, paginación y ejemplo Postman.

## 7. CONTINUIDAD OPERATIVA Y GITHUB (PROCEDIMIENTO EXACTO)

### En el siguiente chat, antes de escribir código
1. Leer este documento COMPLETO e Issue #13. No depender del resumen de memoria. Si se usa GitHub connector, primero inspeccionar get_pr_info/list/tree/fetch_file y las actions reales.
2. Consultar GitHub main HEAD, ramas/PR abiertos, status checks y fechas. Si hay un DEL-A ya iniciado, NO crearlo duplicado ni sobrescribir cambios.
3. Leer src/app.module.ts, schema, migrations, seed, módulos Users/Organization/Orders/Payments/Finance, sus DTO, policies y servicios. Inspeccionar el estado de los datos y la migración requerida por cada fase.
4. En VSCode/terminal Windows del usuario, NO asumir branch actual o carpetas limpias. Verificar con:

~~~powershell
git status
git fetch origin
git switch main
git pull --ff-only origin main
npm run prisma:status
~~~

5. Solo cuando esté confirmado limpio y no exista rama DEL-A activa, proponer/crear nueva branch:

~~~powershell
git switch -c feat/del-a-customers-delivery
~~~

6. Si programamos desde conectores de GitHub, crear commits sobre la rama con expected_sha para evitar sobrescribir HEAD cambiante; verificar CI tras cada commit. Nunca realizar merge por simples respuestas verdes sin revisión de los casos de negocio y QA DEV.
7. DEV primero: confirmar DATABASE_URL y permisos/ambiente (nunca divulgar contraseña). Antes de aplicar SQL aditivo revisar SQL y respaldo; ejecutar bajo entorno correcto:

~~~powershell
npm run prisma:validate
npm run prisma:status
npm run prisma:deploy
npm run prisma:seed
npm run build
npm test
npm run test:e2e
~~~

8. Al terminar cada fase actualizar Issue #13 + docs/checkpoints con commit SHA, PR, CI, migraciones, rutas reales, pruebas DEV y pendientes. No decir que el trabajo se completó sin resultados.

### Preguntas de negocio solo cuando la respuesta cambia la implementación
- Visibilidad y propiedad de un Cliente global en varias sucursales, y cómo registrar uno nuevo sin órdenes previas.
- Política efectiva de entrega: cuándo cobrar (antes o contra entrega), qué roles confirman entrega y qué evidencia se exige.
- Recaudo de repartidor: efectivo recibido y cuándo se entrega a caja; tratamiento de diferencias. Hay propuesta base arriba.
- Canales externos: qué plataforma cobra, cómo se registran comisiones, si una liquidación mezcla sucursales y cuándo reconocer neto.
Si no está decidido, documentar propuesta con alternativas y límites; **no fingir que el usuario ya decidió**. No retrasar revisión técnica, dominio y D1 por decisiones aún innecesarias.

## 8. CRITERIOS DE CIERRE DE DEL-A (NO CONFUNDIR CON SOLO ARRANCAR)

DEL-A estará completado cuando:
- Cliente/dirección con privacidad y permisos probados.
- Orden DELIVERY crea exactamente una Entrega; operación integra ORD-A y estado de cocina sin duplicar consumo.
- Repartidor autorizado realiza transición y evidencia; cancelaciones y excepciones auditadas.
- Pago en calle se registra una sola vez; liquidación crea una sola entrada de caja, preservando corte y diferenciales.
- Canal externo se liquida por neto/comisión sin inventar otro cobro.
- Contratos Swagger, DTO, seed y migraciones replicables; unit/HTTP/CI success y PostgreSQL DEV/POSTMAN funcional revisado por escenarios.
- PR mergeado solamente con autorización del usuario; actualizar checkpoint y roadmap a 13/16 bloques, 23/26 macroflujos tras merge (22 y 24).
- Próxima etapa después del cierre: RSV-A, luego QR-A y REP-A; FEL/hardware fuera del conteo.

## 9. RESUMEN DE ARRANQUE PARA PEGAR EN UN NUEVO CHAT

> **RETOMAR GASTRO CORE DEL-A desde el checkpoint 2026-10-29.** Backend https://github.com/CardonaSantos/new-project. Lee íntegro docs/checkpoints/2026-10-29_FIN_A_MERGE_DEL_A_HANDOFF.md e Issue #13 (https://github.com/CardonaSantos/new-project/issues/13). FIN-A PR #12 ya se fusionó a main mediante 4cfb6c5f, CI postmerge 40932201881 SUCCESS; a esa fecha hay 12/16 bloques funcionales + Core, 124 modelos Prisma, 20 migraciones y 21/26 macroflujos del roadmap completados. DEL-A todavía NO tiene código/PR nuevo: cubre #24 clientes/direcciones y #22 delivery/repartidores/canales/liquidaciones. Comienza verificando HEAD, CI, schema, seed, controladores y migraciones reales; crea rama feat/del-a-customers-delivery desde main actualizado SOLO si no existe ya. Implementar D1 clientes/privacidad, D2 entregas, D3 cobros y liquidaciones PAY-A/FIN-A sin doble dinero ni stock, D4 QA. Arquitectura hexagonal domain/application/ports/infrastructure/presentation; SQL aditivo, RBAC por recurso/sucursal, idempotencia, SERIALIZABLE, auditoría/outbox, Postman DEV y CI por fase. NO duplicar Orders/Payments/Finance, NO iniciar RSV/QR/REP/FEL/hardware ni Angular sin nueva instrucción. Actualizar el checkpoint y pedir pruebas DEV antes del merge.

---
**Hito:** aquí únicamente se documentó y planificó DEL-A. La implementación empezará en el próximo chat.