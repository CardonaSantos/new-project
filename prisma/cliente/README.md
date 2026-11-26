# Carga de un cliente

Dos pasos separados, con un archivo revisable en medio:

1. **Excel → JSON** (`excel/leer_excel.py`). Lee las plantillas de catálogo y de
   configuración, sanea, genera códigos y valida. Escribe `datos/<cliente>.json`
   y muestra los ajustes que hizo y los pendientes del cliente. Si hay errores
   no escribe nada.
2. **JSON → base** (`npm run seed:cliente`). Corre sobre una base recién
   preparada con `seed:initial`.

El JSON de Río Azul ya está generado en `datos/rio-azul.json`, con su foto
genérica `datos/foto-generica.png`. Solo hay que volver a generarlo si el
cliente manda otro Excel:

```
python prisma/cliente/excel/leer_excel.py CATALOGO.xlsx CONFIG.xlsx --salida prisma/cliente/datos/rio-azul.json --dominio rioazul.local --menu-siempre-visible
```

`--menu-siempre-visible` deja el menú sin horario (visible a toda hora), como
pidió Río Azul; sin esa opción se usa el horario de la hoja Menús.

## Cargar en la base local (Windows, cmd)

En el `.env` del servidor, apuntando `DATABASE_URL` a la base **local**:

```
CLIENTE_CARGA_PERMITIR=si
CLIENTE_CONTRASENA_INICIAL=una-contraseña-de-10-o-más
```

y `DO_SPACES_*` configurado (las fotos se suben ahí).

```
npx prisma migrate reset
npm run seed:initial
npm run seed:cliente -- --revisar
npm run seed:cliente
```

`--revisar` valida el archivo y la base sin escribir nada. La carga completa
tarda unos minutos e imprime el avance por fase.

Si falla una fase después de los maestros (por ejemplo, las fotos por falta de
credenciales), se corrige y se repite solo lo que falta:

```
npm run seed:cliente -- --fases=fotos,existencias
```

## Qué se carga

| Fase | Qué hace |
|---|---|
| maestros | Empresa, sucursal y su operación, estaciones, salas y mesas, cajas, categorías con su estación, insumos, proveedores y presentaciones, preparaciones y recetas (publicadas), extras, productos con precio, desechables, menú con horario, cuentas y formas de pago, plataformas de delivery, usuarios. En una transacción. |
| fotos | Una copia de la foto genérica por producto. Sin foto el POS no muestra el producto. |
| existencias | Saldo inicial de cada insumo (con lote si vence) en el almacén principal. |
| qr | Códigos QR de las mesas, solo si el cliente acepta pedidos por QR. |

Lo que la semilla inicial ya creó se reutiliza con los nombres del cliente:
«Sala principal» pasa a ser la primera sala, `CAJA-1` toma el nombre de la
primera caja, y la estación «Cocina» se conserva si el cliente la usa.

Los usuarios entran con `CLIENTE_CONTRASENA_INICIAL` y el sistema les pide
cambiarla. Los que no tenían correo reciben uno provisional
(`nombre.apellido@<dominio>`), que se cambia en Usuarios.

## Copiar la base local a Railway

Cuando la base local esté revisada:

```
pg_dump --no-owner --no-privileges -Fc -d "postgresql://USUARIO:CLAVE@localhost:5432/BASE" -f carga.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "URL_PUBLICA_DE_RAILWAY" carga.dump
```
