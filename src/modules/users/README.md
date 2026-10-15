# Users — Administración de personal (Gastro Core)

Módulo hexagonal con puertos de persistencia y consultas operativas.
Auth mantiene identidad, JWT y hashing Argon2id; Users administra perfiles,
roles, permisos, sucursales, cuentas y seguridad remota; Media controla los
objetos en DigitalOcean Spaces.

## Instalación y migración

Después de actualizar el repo:

```bash
npm install
npm run prisma:validate
npm run build
npm test
npm run prisma:status
```

**Revisar** `prisma/migrations/20261015155000_users_global_roles/migration.sql`
y las filas existentes de `UsuarioRol` antes de ejecutar
`npm run prisma:deploy`. Añade una restricción única parcial para
asignaciones globales. La migración no borra usuarios.

Después de aplicarla, `npm run prisma:seed` registra los nuevos
permisos y los agrega al rol SUPER_ADMIN. No restablece contraseñas.

## Endpoints

Las rutas mantienen `/api` sin `/v1`, conforme al checkpoint.

| Verbo | Ruta | Descripción |
| --- | --- | --- |
| GET | /api/users | Lista paginada, búsqueda por nombre/correo y filtros |
| GET | /api/users/options | Selector paginado por cursor, sucursal y finalidad |
| GET | /api/users/:id | Perfil y roles por sucursal |
| POST | /api/users | Crear usuario y credencial temporal |
| PATCH | /api/users/:id | Editar identidad y perfil |
| PATCH | /api/users/:id/status | Activar/desactivar con motivo |
| PUT | /api/users/:id/avatar | Asociar imagen PERFIL ya cargada en Media |
| GET | /api/users/:id/roles | Asignaciones actuales |
| POST | /api/users/:id/roles | Agregar una asignación (retrocompatible) |
| PUT | /api/users/:id/roles | Reemplazar asignaciones atómicamente |
| GET | /api/users/:id/sessions | Sesiones paginadas |
| DELETE | /api/users/:id/sessions | Revocar todas, con motivo |
| DELETE | /api/users/:id/sessions/:sessionId | Revocar una |
| POST | /api/users/:id/password/reset | Restablecer y revocar sesiones |
| GET | /api/users/:id/audit | Auditoría de modificaciones |
| GET | /api/users/:id/overview | Agregados operativos reales |
| GET | /api/users/:id/activity | Actividad combinada y paginada |
| GET | /api/users/reports/summary | Reporte agregado de empleados |
| GET | /api/roles | Roles paginados |
| GET | /api/roles/options | Selector de roles |
| GET | /api/roles/:id | Detalle y permisos |
| POST | /api/roles | Crear rol |
| PATCH | /api/roles/:id | Actualizar rol |
| PUT | /api/roles/:id/permissions | Reemplazar matriz de permisos |
| GET | /api/permissions | Permisos agrupados por módulo |

Todos requieren Bearer JWT; ninguna ruta de creación es pública.
Solo el SUPER_ADMIN global puede realizar operaciones administrativas.
Para consultar personal con permisos de sucursal, enviar la sucursal en
query; en endpoints con @RequirePermissions, enviar también
`x-sucursal-id` como selector del mismo alcance.

## Ejemplo: crear empleado

```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "cajero@empresa.com",
  "nombre": "Carlos",
  "apellidos": "Méndez",
  "assignments": [{"rolId":"<role-id>","sucursalId":"<branch-id>"}]
}
```

Una contraseña temporal se genera de forma criptográficamente segura y se
entrega una sola vez, sin almacenarse en texto plano. La respuesta incluye
`temporaryPassword` y `requiresPasswordChange`. No permitir caché
de respuestas de creación ni de restablecimiento. El usuario cambiará su
contraseña mediante `PATCH /api/auth/password`.

Para cargar un avatar: `POST /api/media/upload` con `contexto=PERFIL`,
`publico=false`; usar su id en `PUT /api/users/:id/avatar`:

```json
{"mediaId":"<media-id>"}
```

Solo pueden vincularse imágenes confirmadas y subidas por el administrador
que ejecuta la asociación.

## Seguridad

- Contraseñas con Argon2id mediante el puerto de Auth.
- Revocación de todas las sesiones ante cambio de roles, restablecimiento
  de contraseña o desactivación de cuenta.
- Bloqueo del último SUPER_ADMIN activo y de auto-desactivación.
- No se desactivan trabajadores con turno abierto, reparto en curso
  o liquidación de repartidor abierta.
- Auditoría de cambios administrativos sin credenciales ni tokens.
- Las autorizaciones se verifican en la capa de aplicación y nuevamente
  en las transacciones sensibles; el filtro de sucursal se verifica sobre
  el recurso y no confía ciegamente en el header.
- Las respuestas nunca incluyen hashes ni refresh tokens.

## Reportería

`overview` separa **órdenes registradas** de **cobros realizados**.
`Venta` no tiene un vendedor directo; por tanto, no se atribuyen sus ventas
a un empleado sin una relación de negocio válida.
Fechas UTC, inicio inclusivo y fin exclusivo, hasta 366 días.
Montos expresados como strings decimales; no usar floats para moneda.

La actividad mezcla únicamente operaciones con relación directa verificable
al usuario. No representa nómina, presencia laboral ni horas trabajadas.
Para un volumen elevado se recomienda un read model materializado dedicado,
pero no se bloquea el uso inicial.

Las pruebas unitarias son independientes de PostgreSQL; se requiere realizar
pruebas de integración con la base de desarrollo y el cliente Angular antes
de usar estas funcionalidades en producción.
