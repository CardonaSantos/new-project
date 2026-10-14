# Gastro Core API

Backend gastronómico NestJS 12 + TypeScript ESM + PostgreSQL + Prisma ORM 7.
Una empresa por base de datos, múltiples sucursales. El schema gastronómico
ya está pegado; las migraciones iniciales todavía no se han ejecutado.

## Requisitos
- Node.js **24.15+** (o **22.22.3+**); versiones anteriores pueden generar
  `EBADENGINE` con dependencias de Nest CLI / Angular DevKit.
- PostgreSQL disponible cuando habilites módulos persistentes.
- npm.

## Primera instalación

```bash
npm install
```

Este repositorio se inicializó accidentalmente con Prisma CLI 8 RC y Client 7.
La configuración ahora apunta a **7.10.0 para ambos**. Se eliminó el
`package-lock.json` incompatible: `npm install` genera uno nuevo.
**Comitea el nuevo package-lock.json** tras la primera instalación; para los
siguientes entornos usa `npm ci`. No ejecutes `npm audit fix --force`
sin revisar cambios incompatibles.

Crea `.env` a partir de `.env.example` y edita DATABASE_URL. En PowerShell:

```powershell
Copy-Item .env.example .env
```

## Prisma

`prisma/schema.prisma` ya contiene el esquema gastronómico. Mantén el output
`../src/generated/prisma` y ejecuta:

```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
npm run build
```

Con la base PostgreSQL creada, después de revisar el esquema:

```bash
npm run prisma:migrate -- --name init
```

Nunca ejecutes migraciones sin confirmar primero `DATABASE_URL` y el
contenido del esquema; el schema mínimo **no** debe migrarse a una base real.
Para producción usa `npm run prisma:deploy` con migraciones revisadas.
Si usas pooler en runtime, define DIRECT_URL para Prisma CLI.

PrismaService usa `@prisma/adapter-pg` y `ConfigService`. Importa
`PrismaModule` dentro del módulo que implemente el adaptador Prisma.
Los casos de uso y el dominio no deben depender del ORM.

El cliente generado en `src/generated/prisma` no se versiona. Siempre
ejecuta `prisma generate` antes de compilar; `npm run build` lo hace
automáticamente. La primera compilación requiere tener instaladas las
dependencias y generado el cliente.

## HTTP
- `GET /api/v1/health` responde sin necesidad de tener PostgreSQL.
- `api` es el prefijo y `v1` la versión URI predeterminada.
- Validación global con whitelist, forbidding extra fields y transformación.
- CORS se habilita solo si configuras `CORS_ORIGINS` (orígenes separados
  por comas; no wildcard con credenciales).
- La configuración se carga de `.env` mediante `@nestjs/config`.

## Módulos y capas

Ver `src/modules/README.md` y `src/modules/auth/README.md`.
Autenticación, RBAC dinámico, permisos por sucursal, órdenes, KDS, stock,
kardex, caja y delivery se implementarán por etapas. No hay login simulado
ni endpoints de escritura sin autorización. No se implementa FEL aún.

## Cambios respecto de la plantilla NestJS

Se retiraron observabilidad con credenciales de ejemplo y el Hello World,
y se sustituyeron por `CoreModule` y una ruta de salud.
Las skills .agents/.claude/.cursor/.devin fueron generadas por Prisma 8 RC,
no forman parte del servidor; se eliminaron junto con el postinstall que
las volvía a instalar.

## Perfiles, Media y comprobantes de pago

- `PerfilUsuario`: 1:1 opcional con `Usuario`, separado del login y roles.
- `Media`: guardamos el proveedor S3, bucket, clave del objeto, URL opcional, tipo, MIME, tamaño, dimensiones y fechas de carga y eliminación.
- `ProductoMedia`, `VarianteProductoMedia`, `ArticuloInventarioMedia` y `CategoriaMedia`: relaciones M:N con orden y bandera principal; `PerfilUsuario.avatarMedia` es opcional.
- Publicar un producto en el menú (`visibleEnMenu=true`) debe exigir desde el caso de uso al menos una imagen confirmada y vigente del producto o de su variante. Prisma no impone por sí solo ese requisito condicional.
- Para borrar físicamente de Spaces, usar bucket+claveObjeto, comprobar referencias y borrar de forma asíncrona; nunca basarse en URL pública.
- `IntentoPago` y `Pago` almacenan referencias de transacción, código de autorización y terminal si existen. Pueden asociarse a la `Cuenta` y su `Venta` interna. FEL sigue pendiente y no se agregaron tablas fiscales.
- `src/generated/prisma/client.ts` se genera, no se comitea. `npm run start:dev` ahora ejecuta la generación primero. Si ves TS2307, ejecuta `npm run prisma:generate` y reinicia el TypeScript Server de VS Code.

No se implementó aún la carga remota, la firma de URLs, los endpoints de Media ni la API de tarjetas: estas tablas solo preparan sus relaciones.
