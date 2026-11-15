# Semilla de demostración — traspaso

Documento para quien retome **solo la semilla de demostración** (`prisma/demo/`).
El resto del sistema no está en cuestión aquí.

Rama: `feat/seed-initial-20261113` (33 commits sobre `main`, sin PR abierto).

---

## 1. Lo primero: el síntoma abierto

El usuario reporta: **«cuando entro a la sucursal no veo bien los registros, ni
órdenes»**. Está mirando la base que dejó la corrida del 2026-11-15 (4.930
tickets). Eso no está diagnosticado todavía, y es la prioridad.

No lo adivines. La base está ahí; preguntale. Estas consultas separan las
hipótesis en un minuto:

```sql
-- ¿Cuántas órdenes quedaron abiertas, y de qué fechas?
SELECT estado, count(*), min("creadoEn")::date, max("creadoEn")::date
FROM "Orden" o JOIN "Sucursal" s ON s.id=o."sucursalId"
WHERE s.codigo LIKE 'DEMO-%' GROUP BY estado;

-- ¿Las ventas tienen fecha de cierre, y en qué rango?
SELECT count(*), min("cerradaEn")::date, max("cerradaEn")::date,
       count(*) FILTER (WHERE "cerradaEn" IS NULL) AS sin_cerrar
FROM "Venta" v JOIN "Sucursal" s ON s.id=v."sucursalId"
WHERE s.codigo LIKE 'DEMO-%';

-- ¿Hay comandas sin entregar? (bloquean liquidación y cierre)
SELECT c.estado, count(*) FROM "Comanda" c
JOIN "Orden" o ON o.id=c."ordenId" JOIN "Sucursal" s ON s.id=o."sucursalId"
WHERE s.codigo LIKE 'DEMO-%' GROUP BY c.estado;

-- ¿Qué días cerraron operativamente? (deberían ser 58 por sucursal)
SELECT s.codigo, count(*) FROM "CierreOperativo" co
JOIN "Sucursal" s ON s.id=co."sucursalId"
WHERE s.codigo LIKE 'DEMO-%' GROUP BY s.codigo;

-- ¿Los turnos de caja cerraron?
SELECT t.estado, count(*) FROM "TurnoCaja" t JOIN "Caja" ca ON ca.id=t."cajaId"
JOIN "Sucursal" s ON s.id=ca."sucursalId"
WHERE s.codigo LIKE 'DEMO-%' GROUP BY t.estado;
```

**Hipótesis ordenadas por probabilidad**, para que el resultado de esas
consultas las confirme o las descarte:

1. **Las 115 órdenes abiertas.** La corrida dejó 115 órdenes en `ABIERTA` con
   comandas sin entregar, repartidas en 8 semanas. Si la pantalla de sucursal
   lista órdenes abiertas, muestra un montón de órdenes viejas; si lista las de
   hoy, muestra casi nada. Las dos lecturas se ven «mal».
2. **El rango de fechas por defecto de las pantallas.** La historia va del
   2026-09-20 al 2026-11-14. Si una pantalla filtra «hoy» y la corrida terminó
   el 14, el 15 no tiene nada. Verificar qué rango pide el frontend.
3. **Algo que la semilla no crea.** La semilla inicial avisa: «Falta por
   configurar desde la app: mesas, catálogo y cuentas financieras». La de demo
   sí crea mesas y catálogo, pero **no crea `CuentaFinanciera` ni
   `RutaFinanciera`**, así que no hay un solo `MovimientoFinanciero`. Toda
   pantalla de tesorería o conciliación bancaria está vacía, y eso es correcto
   pero puede ser lo que el usuario está viendo.
4. Descartada ya: los roles **sí** están asignados por sucursal
   (`UsuarioRol.sucursalId`), verificado en `masters.ts:647`.

---

## 2. Estado real

Última corrida completa (2026-11-15, 50 min, sin interrupciones):

```
4.930 tickets vendidos · 4 sucursales · 58 días (2026-09-20 → 2026-11-14)
Todos los días alcanzaron su objetivo salvo dos.
```

Fallos de esa corrida:

| Cantidad | Fallo | Causa |
|---|---|---|
| 115 | `liquidar cuenta: Hay comandas pendientes` | la comanda nunca se entregaba |
| 115 | `cerrar orden: Hay comandas pendientes` | consecuencia del anterior |
| 49 | `cierre operativo: Hay órdenes del día pendientes` | consecuencia, 49 de 232 días |
| ~60 | bizcocho insuficiente en cocina y producción | producción mal dimensionada |
| 6 | `Stock utilizable insuficiente para BEB-JUGO-500` | realista, dejar |
| 1 | `PT-PASTEL-FRESA` sin stock | realista, dejar |

**Hay dos arreglos commiteados después de esa corrida y NO verificados por
ninguna ejecución** (commit `8a9614d`):

1. `kitchen.deliver(...)` — faltaba por completo. Sin ese paso la comanda
   queda `LISTA` y nunca `ENTREGADA`, y la cuenta no liquida. **Esta es casi
   con seguridad la causa de los 115 + 115 + 49.**
2. Los tres pasos de cocina (`start`, `ready`, `deliver`) ahora propagan su
   fallo en vez de anotarlo y seguir, de modo que la orden se cancela
   (`orders.cancel`, clasificación `MERMA_OPERATIVA`) en lugar de quedar
   abierta.
3. La producción ahora lee `Existencia` de la ubicación y hornea el faltante,
   en vez de aplicar un margen adivinado.

**Lo primero que debería hacer el siguiente:** correr
`npm run seed:demo -- --reset --semanas=1 --tickets=5` (≈3 min) y mirar si
`comandas pendientes` cae a cero. Esa es la única pregunta pendiente.

---

## 3. Cómo se ejecuta

```cmd
npm run seed:initial                      :: idempotente, requerida antes de la demo
npm run seed:demo -- --simular            :: valida datos, no escribe nada
npm run seed:demo -- --reset --semanas=1 --tickets=5    :: ≈3 min, prueba de humo
npm run seed:demo -- --reset              :: 8 semanas, ≈50 min
```

Variables en `.env`: `DEMO_SEED_PASSWORD` (obligatoria), y la guarda de
autorización que `index.ts` exige. `run.mjs` compila con `tsc` y **se niega a
ejecutar si hay errores de tipo** (`--ignorar-tipos` para forzar).

El usuario trabaja en **Windows/cmd**: `set VAR=valor` (sin comillas, que se
vuelven parte del valor), no `export`.

---

## 4. Arquitectura

```
prisma/seed.ts            203  semilla inicial: empresa, SUPER_ADMIN, 5 roles,
prisma/seed-roles.ts      131  unidades, almacén, estación, caja, sala
prisma/demo/
  run.mjs                  54  compila con tsc y ejecuta
  index.ts                198  entrada: contexto Nest, fases, auditoría de fechas
  runtime.ts              236  opciones CLI, Rng determinista, curvas de demanda
  validate.ts             251  coherencia de los datos antes de escribir nada
  articles.ts             135  81 artículos de inventario
  products.ts             396  12 categorías, 6 grupos de modificadores, 40 productos
  recipes.ts              536  14 recetas de producción + 44 de venta, dos niveles
  branches.ts             234  4 sucursales, menús, precios, mesas, cajas
  supply.ts               206  7 proveedores, 65 presentaciones de compra
  masters.ts              704  escribe todo el catálogo y los usuarios
  purchases.ts            349  abastecimiento: orden→recepción→factura→pago
  history.ts              823  la operación diaria (ver abajo)
  reset.ts                207  105 DELETE en orden de dependencias
  backdate.ts             153  corrige el reloj después de operar
  check-schema-usage.py   439  5 verificadores estáticos
```

**Tres fases**, reanudables con `--fases=maestros,compras,historia`:

- **maestros** — escritura directa a Prisma (upsert por código `DEMO-*`).
- **compras** — conduce los servicios reales de compras, luego fecha todo el
  abastecimiento 58 días atrás.
- **historia** — por sucursal y por día: abre turno, produce preparaciones,
  vende N tickets, registra un gasto, cierra turno, cierra el día. Al final de
  cada día corrige el reloj de lo que ese día escribió.

### `history.ts`, que es donde está todo lo difícil

Un ticket toma uno de dos caminos:

- **rápido** (`quickCheckout`) solo si: modalidad `MOSTRADOR` o `PARA_LLEVAR`,
  **sin** productos `PREPARADO`, y **sin** transferencia. El store rechaza
  cualquier otra combinación.
- **largo**: `orders.create` (con líneas y `enviarCocina`) → cola de cocina →
  `start`/`ready`/`deliver` → `payments.accounts` para obtener la cuenta →
  `collect` → confirmar intentos de transferencia → ciclo de entrega si es
  delivery → `finalize` → `orders.close`.

---

## 5. Trampas que costaron una corrida cada una

Esto es el valor real del documento. Cada línea costó entre 3 y 50 minutos de
ejecución.

**Firmas de servicio que no son lo que parecen.** Los servicios se exponen con
`...args: any[]`, así que TypeScript no protege nada. Verificadas una por una:

| Llamada | Devuelve / exige |
|---|---|
| `cash.open` | `{ shiftId }`, **no** `{ id }` |
| `orders.create` | la orden completa → la clave es `id`; exige `lineas` y `claveOperacion` |
| `kitchen.queue` | `{ data, meta, totals }`; exige `page` y `limit` sin valores por defecto |
| `kitchen.start/ready/deliver` | `(u, id)` sin DTO |
| `payments.finalize` | `(u, orderId)` — **liquida, no cobra** |
| `payments.collect` | `(u, cuentaId, dto)` — el cobro va contra la **cuenta**, no la orden |
| `finance.issueIntent` | el `operationId` lo emite el servicio, atado a actor+sucursal+acción |

**Permisos.** `CAJERO` no tiene ningún permiso de entregas: una orden
`DELIVERY` la tiene que crear el gerente (`delivery.manage`), y el repartidor
necesita `delivery.courier` o `delivery.manage`. Un gasto de caja solo lo
registra el **dueño del turno** (`cash.store` exige `shift.cajeroId === actor`),
y el permiso `finance.expenses.create` se agregó a `CAJERO` en
`seed-roles.ts` por eso — **decisión de producto pendiente de revisión**.

**El reloj.** Ninguna columna de fecha se puede escribir: 60 columnas son
`DEFAULT CURRENT_TIMESTAMP` y las evalúa PostgreSQL. La semilla opera «ahora» y
corrige el reloj después (`backdate.ts`, lee las columnas de
`information_schema`). **El reajuste está acotado por arriba al instante en que
corre**: sin ese techo arrastraba también las fechas puestas a futuro, y los
vencimientos de lote retrocedían hasta 112 días, dejando todo perecedero
vencido y el inventario en `disponible: 0`.

**Los lotes.** El motor de inventario rechaza un lote vencido *comparando con
hoy*, así que los lotes se crean válidos respecto al presente y se corrigen
después.

**El reset.** 105 sentencias en orden topológico de 253 llaves foráneas, casi
todas `Restrict`. Tiene que borrar `OperacionIdempotente` o un reseed posterior
devuelve resultados guardados sin hacer el trabajo y reporta éxito habiendo
escrito nada.

**Nombres de relación.** Las relaciones inversas del esquema llevan el sufijo
del campo que las origina: `usuarioRolesComoUsuario`, no `usuarioRoles`.

---

## 6. Los verificadores

`python3 prisma/demo/check-schema-usage.py prisma/demo/*.ts prisma/seed.ts`

Cinco comprobaciones estáticas, sin base de datos y sin `node_modules`:

1. modelos, campos y claves de todas las escrituras Prisma;
2. claves de los `where`, entrando por las relaciones con el modelo de cada salto;
3. tablas y columnas del SQL crudo del reset, con alias y ámbitos de paréntesis;
4. orden de borrado contra el grafo completo de llaves foráneas;
5. identificadores: todo lo que se llama como función está declarado o
   importado, y todo import de un módulo hermano existe.

**Corralos antes de cada commit.** Los cinco pasan hoy. Están probados al
revés: si se rompe a propósito lo que arreglan, lo nombran.

Lo que **no** cubren: reglas de negocio, permisos reales y contratos de DTO.
Eso solo se ve ejecutando.

---

## 7. Mis fallas, para que no se repitan

Esto es por lo que el usuario pide el traspaso, y es información útil.

**Tres ediciones se perdieron en lotes de cambios, y en dos casos reporté como
arreglado algo que nunca entró al commit.** La peor: `kitchen.deliver` — escribí
«la comanda ya se entrega», la línea nunca existió, y el síntoma siguió dos
corridas más mientras yo buscaba la causa en otro lado. `git log -S` lo
confirmó.

Causa: hacía varias sustituciones de texto en un solo script y no verificaba
que cada una hubiera aplicado. **Verificá con `grep` el resultado en el archivo
después de editar, no que el parche «no dio error».**

**Adiviné firmas de servicio en vez de leerlas.** Cuatro veces el mismo error
(`shiftId`, `orderId`, `finalize`, `collect`), y una de esas «correcciones»
rompió código que estaba bien. La tabla de la sección 5 es el resultado de
leerlas; está verificada.

**Toleré fallos en silencio.** `catch {}` vacíos hicieron que la primera corrida
reportara éxito habiendo vendido cero. El agrupador de fallos de `history.ts`
existe por eso, y tardó dos corridas más en ser legible porque los errores de
Prisma empiezan con un salto de línea y yo tomaba `split('\n')[0]`.

---

## 8. Cambios a la aplicación (fuera de la semilla)

Cuatro archivos de `src/` tocados, todos pendientes de revisión del usuario:

- `orders/presentation/http/dto/orders.dto.ts` y
  `orders/infrastructure/prisma/order.store.ts` y
  `delivery/infrastructure/prisma/delivery.store.ts` — reenvían
  `canalExternoId` y `referenciaExterna`. **Era un hueco real**: una orden con
  origen `PLATAFORMA` no se podía crear por ninguna ruta, porque la entrega
  encadenada las exige y el DTO no las llevaba.
- `purchases/infrastructure/prisma/purchase-shared.ts` — `atomic()` adjunta el
  error de Prisma como `cause`. Antes una violación de unique y un fallo de
  serialización se reportaban con el mismo texto.

---

## 9. Pendientes

1. **Verificar los dos arreglos sin ejecutar** (sección 2). Una corrida de
   `--semanas=1 --tickets=5` responde.
2. **Diagnosticar el síntoma del usuario** con las consultas de la sección 1.
3. **Cuentas financieras**: la semilla no crea `CuentaFinanciera` ni
   `RutaFinanciera`, así que no hay movimientos de tesorería ni conciliación
   bancaria en el demo.
4. **Formato de Excel** para que un cliente llene productos, recetas e
   inventariables — pedido y nunca entregado.
5. **Abrir el PR** de la rama.
6. Decidir sobre el permiso `finance.expenses.create` en `CAJERO`.
