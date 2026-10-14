# Gastro Core API

Backend gastronómico NestJS 12 + TypeScript ESM + PostgreSQL + Prisma ORM 7.
Una empresa por base de datos, múltiples sucursales. Sin migraciones ni
modelos gastronómicos en este primer commit.

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

`prisma/schema.prisma` contiene solo generator y datasource; pega allí el
esquema **Gastro Core** completo cuando lo revisemos. Mantén el output
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
