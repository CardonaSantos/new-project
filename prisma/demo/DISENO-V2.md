# Semilla de demostración v2 — diseño

Fecha: 2026-11-15 · Estado: **aprobado — decisiones del dueño abajo (§5)**

Objetivo acordado: **un mes de historia** (28 días), cantidad moderada y
calidad alta — el cliente ve cómo el sistema registra con el tiempo, las
cuatro sucursales operando completo, no solo vendiendo.

**Regla de oro (del dueño): solo se siembra lo que se puede crear desde la
UI.** Si algo no tiene pantalla, no está implementado de verdad, y sembrarlo
es maquillar el demo. Cada flujo del diseño está verificado contra las
páginas del repo Angular; lo que no pasó la prueba quedó fuera (§3.1).

---

## 1. Lo que la investigación encontró

### 1.1 El síntoma del inventario es de la UI, no de los datos

Verificado de punta a punta:

- **Backend correcto** — `inventory-operations.store.ts:48` filtra existencias
  por `ubicacion.almacen.sucursalId`; cada sucursal tiene su almacén, su
  ubicación y sus existencias propias (la semilla las crea por sucursal).
- **Bug en el frontend** — `inventory-list-page.ts:547`:

  ```ts
  protected async setFilter(key, value) {
    await this.url.patch({ [key]: value, page: 1 });
  }
  ```

  Cambiar `sucursalId` **no limpia** `almacenId`, `ubicacionId`, `articuloId`
  ni `loteId`. El backend recibe «almacén de la sucursal A dentro de la
  sucursal B» y responde cero filas. Mismo patrón en summary, reports y
  operation. Además `inventory-url-state.ts:42` hace que la URL gane sobre el
  contexto global de sucursal, de modo que el valor viejo persiste.

  **Arreglo propuesto** (repo Angular, entregable aparte de la semilla):
  centralizar en `InventoryUrlState.patch` — cuando cambia `sucursalId`,
  anular los cuatro filtros dependientes.

### 1.2 Cobertura real de la semilla actual

El esquema tiene **126 modelos**. Tras una corrida completa quedan con filas
~78 (semillas directas + operación por servicios). Quedan **vacíos** los de
estos grupos — y cada pantalla asociada se ve vacía en el demo:

| Grupo | Modelos vacíos |
|---|---|
| Tesorería | `CuentaFinanciera`, `RutaFinanciera`, `MovimientoFinanciero`, `LineaExtractoBancario`, `ReversaFinanciera` |
| Clientes | `Cliente`, `DireccionCliente`, `ClienteSucursal` |
| Reservas | `Reserva`, `ReservaMesa`, `EventoReserva`, `RecordatorioReserva` |
| Operación de inventario | `ConteoInventario(+Lineas)`, `AjusteInventario(+Lineas)`, `TransferenciaInventario(+Lineas)`, `Requisicion(+Lineas)`, `ConsumoInterno` |
| Liquidaciones | `LiquidacionRepartidor(+Lineas)`, `LiquidacionCanalExterno(+Lineas)` |
| Compras (devoluciones) | `DevolucionProveedor(+Lineas)`, `NotaCreditoProveedor`, `AplicacionNotaCreditoProveedor`, `ReintegroProveedor` |
| Pagos | `ReembolsoPago` |
| Catálogo fino | `MenuHorario`, `VarianteSucursal`, `PrecioModificador` |
| Dispositivos y QR | `Dispositivo`, `AccesoMesaQR`, `SesionAutoservicio` |
| Media | `Media` y sus 4 tablas de vínculo |

Se llenan solos con el uso y **no se siembran**: `SesionUsuario`,
`IntentoAcceso`, `IntentoRecordatorio`, `IntentoPago` (ya se crea con
transferencias).

Todos los flujos faltantes **tienen servicio de aplicación** para conducirlos:
`customers`, `reservations` (create → confirm → checkIn / noShow / cancel),
`inventory-operations` (conteos, transferencias, requisiciones),
`inventory-internal-consumption`, `finance` (createAccount,
upsertFinancialRoute), `finance-bank` (importLines, match, reverse),
`delivery-settlements` (repartidor y plataforma). `Orden.clienteId` existe, así
que los delivery pueden referenciar clientes reales.

### 1.3 Duración y volumen

Decisión final del dueño: **un mes** (default `--semanas=4`, 28 días) y
**~14 tickets/día** promedio por sucursal en lugar de 22 — la curva semanal
se mantiene (sábado vende el doble que lunes), baja la cantidad, sube la
calidad, y la corrida completa queda en ~20 minutos. `--semanas` y
`--tickets` siguen disponibles para pruebas.

---

## 2. Decisión de arquitectura: qué se conserva y qué se rehace

El motor de operación actual —ticket por dos caminos, cocina con
`readyDeliver`, cobro contra la cuenta, verificación de transferencias, ciclo
de entrega, cancelación por merma, producción contra existencias, corrección
de reloj acotada, reset topológico y los cinco verificadores— acaba de llegar
a **cero fallos** en la prueba de humo y codifica todas las firmas que
costaron una corrida cada una aprender. Rehacer eso desde cero re-paga esa
matrícula sin ganar nada.

Lo que **sí se rediseña** es la semilla como producto: su alcance, sus fases y
todo lo que rodea al motor. v2 es una semilla nueva con el motor probado
adentro.

## 3. Las fases de v2

```
0 identidad    directo    sucursales, personal, DISPOSITIVOS, QR por mesa
1 catálogo     directo    lo actual + MENÚ CON HORARIO, VARIANTES PAUSADAS,
                          PRECIOS DE MODIFICADOR por sucursal
2 tesorería    directo    CUENTAS FINANCIERAS y RUTAS por método y sucursal
3 clientes     directo    ~30 clientes guatemaltecos, NIT, direcciones con
                          coordenadas, frecuentes por sucursal
4 abasto       servicios  compra inicial + REPOSICIÓN SEMANAL por proveedor,
                          (devoluciones: fuera, sin UI — §3.1)
5 operación    servicios  el motor actual intacto, MÁS por semana:
                          conteo físico dominical → ajuste chico,
                          consumo interno diario (comida de personal),
                          reservas en restaurante (ciclo completo + no-show),
                          requisición cafetería→repostería atendida con
                          transferencia (pasteles/bizcochos), 2 órdenes QR de autoservicio por semana
                          (liquidaciones y reembolsos: fuera, sin UI — §3.1)
6 bancos       servicios  extracto quincenal generado de los movimientos
                          reales ± comisiones, match del ~90 %, 3-4 líneas sin
                          conciliar y una reversa — conciliación viva
7 reloj        igual      backdate acotado + auditoría + COBERTURA: la corrida
                          falla si una tabla operativa esperada quedó vacía
```

Puntos de diseño con intención:

- **Rutas financieras primero**: `payments.store` ya postea
  `MovimientoFinanciero` cuando existe ruta activa. Crear cuentas y rutas en
  la fase 2 hace que toda la tesorería del período se escriba sola desde los
  cobros, gastos y pagos a proveedor del motor — cero código nuevo en el flujo
  de dinero.
- **Reposición semanal**: hoy toda la compra es un solo lote inicial (Q22k de
  lácteos en una orden). Producción compra semanal; el historial de compras
  pasa de 27 documentos a ~160-180, con fechas repartidas en el período.
- **Transferencias con sentido de negocio**: la repostería produce, la
  cafetería pide (requisición) y recibe (transferencia). Es el flujo real de
  un negocio con producción central — y llena requisiciones, transferencias y
  los movimientos TRANSFERENCIA del kardex. *(pregunta abierta §5)*
- **Cobertura como aserción**: la fase 7 imprime la tabla modelo→filas y
  **falla** si algo esperado quedó en cero. El «se ve vacío» no vuelve a
  descubrirse en la pantalla del cliente.

### 3.1 Recortes por la regla de oro (verificado contra el Angular)

| Flujo | Veredicto | Evidencia |
|---|---|---|
| Conciliación bancaria | **entra** | `finance-statements`, `finance-reconciliation`, `finance-accounts/-create`, `finance-routing` |
| Horario de menú | **entra** | `catalog-menu-detail` edita horarios |
| Variantes pausadas | **entra** | `catalog-product-detail` (pausa) |
| QR + autoservicio | **entra** | `orders-tables-page` genera QR; feature `self-service` |
| Consumo interno | **entra** | `inventory.api.ts:95` `internalConsumption` |
| Requisición + transferencia | **entra** | `purchases-requisition-create`, `inventory-document-create` (sucursal destino) |
| Devolución / nota de crédito a proveedor | **fuera** | sin página de creación en `purchases` |
| Reembolsos de pago | **fuera** | solo aparecen en reportes, sin pantalla que los emita |
| Liquidaciones repartidor / canal | **fuera** | solo en helpers de reportes; el servicio existe pero la UI no lo opera |
| `Media` (fotos/logos) | fuera | exige archivos reales en storage; se cargan desde la app |

Los tres «fuera» con servicio de backend quedan documentados como huecos de
frontend: cuando tengan pantalla, entran a la semilla.

Los menús **no se olvidan**: publicados como hoy, y ahora con horario (menú
de desayuno en cafetería y restaurante).

## 4. Volumetría estimada (1 mes, 4 sucursales) — módulos con registros: **13**

organization · users · catalog · inventory · recipes · purchases · orders ·
payments · delivery · finance · customers · reservations · self-service
(auth/sesiones se llenan solas al usar; reports lee, no escribe)

| | |
|---|---|
| Tickets vendidos | ~1,500–1,700 (más ~2 % cancelados por merma, a propósito) |
| Clientes / direcciones | ~30 / ~45, delivery atado a cliente real |
| Documentos de compra | ~70 (inicial + reposición semanal) |
| Producciones | ~350 lotes |
| Movimientos de inventario | ~5,500 |
| Conteos / ajustes / transferencias / requisiciones | 16 / ~10 / ~8 / ~8 |
| Consumo interno | ~100 (comida de personal, diario) |
| Reservas | ~16 (ciclo completo, 2 no-show, 1 cancelada) |
| Sesiones QR de autoservicio | ~8 |
| Movimientos financieros | ~2,000 · extracto ~120 líneas, ~90 % conciliado, 1 reversa |
| Tiempo de corrida | **~20 min** |

## 5. Decisiones del dueño (2026-11-15)

1. **Transferencias entre sucursales** — sí: la cafetería requisa pasteles y
   bizcochos a la repostería, que produce y transfiere.
2. **La conciliación bancaria entra** en v2.
3. **El bug del inventario se arregló ya** — repo Angular, rama
   `fix/inventario-filtros-sucursal`: `InventoryUrlState.patch` limpia
   `almacenId`/`ubicacionId`/`articuloId`/`loteId` al cambiar de sucursal,
   con el spec actualizado al contrato nuevo.
