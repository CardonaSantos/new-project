# Semilla de demostración — Café Pepita de Oro

Fecha: 2026-11-17 · Reemplaza a la semilla de cuatro sucursales (v2).

Una cafetería de especialidad en Antigua Guatemala, tres semanas de
operación, para que el cliente vea el sistema funcionando como en un
negocio real. **Regla de oro: solo se siembra lo que se puede crear desde la
UI.**

## Cómo correrla

```
npx prisma migrate reset
npm run seed:initial
set DEMO_SEED_ALLOW=yes
set DEMO_SEED_PASSWORD=<contraseña>
npm run seed:demo
```

Prueba corta: `npm run seed:demo -- --semanas=1 --tickets=15`.

La semilla **no borra nada**: corre sobre una base recién preparada y se
niega si ya hay catálogo. Por eso los códigos son los del negocio, sin el
prefijo DEMO-. `--reset` ya no existe.

## El negocio

| | |
|---|---|
| Empresa | Café Pepita de Oro · Pepita de Oro, S. A. · NIT 10871042-4 · color #6F4E37 |
| Sucursal | La PRINCIPAL de `seed:initial`, renombrada: 5a Avenida Norte #14, Antigua |
| Reutiliza | almacén PRINCIPAL/GENERAL, CAJA-1, «Sala principal», estación «Cocina» |
| Agrega | estación «Barra», patio con 5 mesas (11 mesas en total, cada una con QR), 4 dispositivos |
| Usuarios | Lucía Morales (gerente@demo.local, ADMIN_SUCURSAL) · Diego Ajú (cajero@demo.local, CAJERO) · Andrea Xocop (barista@demo.local, COCINA) |
| Dueño | el SUPER_ADMIN de `seed:initial`: compras, banco y cierre del día |
| Clientes | 20, con NIT válido o CF, direcciones con coordenadas en Antigua y alrededores |
| Proveedores | 8: tostaduría, lácteos y embutidos, abarrotes, mercado, panadería, repostería, bebidas, empaques |

## Catálogo

- **Carta publicada** (sin horario, para que el POS la muestre a cualquier
  hora): 30 productos, 39 variantes con precio; 77 artículos de inventario. Café caliente, café frío,
  sin café, desayunos todo el día, pan y repostería, embotelladas y el cargo
  por domicilio.
- **Toppings**: tipo de leche (sustituye la entera), shot extra, jarabes,
  toppings, endulzante, y para desayunos huevos al gusto y pan o tortillas
  (obligatorios) y extras.
- **Medidas de cocina**: Cucharada (15 ml) y Cucharadita (5 ml) para
  líquidos; **Cucharada de café molido (7 g)** como unidad de masa propia,
  porque la conversión del sistema exige la misma dimensión. El espresso va
  en gramos, el café de pichel en cucharadas de café, la leche condensada,
  los jarabes, la miel y la crema en cucharadas, la vainilla en cucharaditas.
- **Producción propia**: jarabe simple, jarabe de vainilla (lleva jarabe
  simple), cold brew, frijol volteado, atol de elote (la olla del día, a la
  medida), pan de banano (por molde de 10 rebanadas) y rellenitos (por
  docena, llevan frijol volteado). Lo que dura más de un día se planifica con
  doble cobertura.
- Costo de receta entre 10 % y 38 % del precio.

## La operación de cada día

| Hora local | Quién | Qué |
|---|---|---|
| 06:00 | proveedores | reposición semanal (días 8 y 15), pagada desde el banco |
| 06:20 | gerente | producción del día según existencias |
| 06:50 | cajero | apertura de caja con Q500 |
| 07:00–18:45 | cajero y barista | ~25 tickets (sábado más que lunes), cada uno a su minuto |
| media jornada | cajero | gasto de caja chica, tres de cada diez días |
| 18:50 | gerente / dueño | consumo interno, merma del atol sobrante, conteo dominical, servicios del mes, extracto |
| 19:05 | cajero | cierre de caja con su arqueo |
| 19:20 | dueño | cierre operativo del día |

Agotados: lo que se produce en casa y ya no alcanza no se vende; el cliente
pide lo demás, o un café de pichel si todo lo que quería se acabó. Antes se
cobraba igual y la cocina cancelaba la orden.

Modalidades: 45 % mesa (de esas, 30 % por el QR de la mesa), 15 %
mostrador, 28 % para llevar con empaque, 12 % domicilio (propio por teléfono
y web con clientes registrados, o por PedidosYa y Hugo).

Tesorería: cuenta Banco Industrial y caja fuerte, rutas de tarjeta y
transferencia. La compra de apertura no pasa por el banco y queda como
inversión inicial pendiente de cuenta. Servicios del mes (EEGSA, Tigo, agua
municipal) por banco; el internet se registra dos veces y finanzas anula el
duplicado. Extracto el día 15 y el 21, ~95 % conciliado.

Fechado: toda la instalación se fecha 10 días antes del período, la compra
de apertura 2 días antes. Las columnas de solo fecha (día operativo del
turno, emisión de factura, elaboración de lote) se mueven con su día; los
vencimientos nunca.

## Verificación sin base de datos

- `check-schema-usage.py`: modelos, campos, obligatorios, where, imports,
  identificadores.
- Chequeo de tipos del seed contra stubs de los módulos de la app.
- `validateDemoData`: referencias, costos contra presentaciones, unidades de
  cocina en su dimensión, rutas a estación, empaque.
- Simulación ticket por ticket de las tres semanas con las funciones reales
  de compra, con 30 semillas aleatorias distintas: ninguna corrida con un
  ticket fallido, ~9 líneas agotadas por corrida de ~1,300, merma de atol
  ~0.5 L diarios. Una sola semilla no basta: así se veía bien y en la
  corrida real se agotó el atol.

## Fuera, y por qué

- **Reservas**: una cafetería no las usa; el módulo existe.
- **Requisiciones y transferencias**: una sola sucursal.
- **NO_ASISTIO, devoluciones a proveedor, reembolsos, liquidaciones**: o
  exigen reloj real, o no tienen pantalla que los cree.
- **Variantes pausadas**: la pausa corre contra el reloj real; el producto
  no se habría vendido en todo el período.
