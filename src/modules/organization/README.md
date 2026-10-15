# OrganizationModule — Empresa, sucursales y dispositivos

Etapa 0 de Gastro Core. Responsable de la configuración empresarial única,
administración de sucursales, políticas operativas y registro de terminales.
Prisma, Auth y las dependencias transversales se consumen mediante puertos.
No contiene transacciones de órdenes, caja, inventario ni delivery.

## Base de datos y preparación

Nuevos permisos insertados por el seed idempotente:
`organization.read`, `organization.manage`,
`branches.read`, `branches.manage`,
`devices.read`, `devices.manage`.
El rol SUPER_ADMIN global los recibe mediante seed.

La migración `20261015173500_organization_singleton` establece un índice
único de expresión que impide múltiples registros de `EmpresaConfiguracion`.
**Antes de aplicar:** verificar que ya no existan dos o más empresas
registradas, porque el índice no podría instalarse. Nunca borrar datos
para que pase la migración sin evaluación del usuario.

```bash
npm run prisma:status
npm run prisma:validate
npm run build
npm test
npm run test:e2e
npm run prisma:deploy
npm run prisma:seed
```

El seed también añade `ConfiguracionSucursal` a la sucursal inicial
`PRINCIPAL` si faltaba, sin sobrescribir ajustes preexistentes.

## Endpoints actuales

Todas las rutas llevan prefijo `/api`, sin `/v1`.
Se exige token de acceso Bearer. Las escrituras requieren permisos
administrativos globales o permisos apropiados de sucursal y vuelven
a verificarse en una transacción en PostgreSQL.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | /api/organization | Empresa actual |
| PATCH | /api/organization | Configurar empresa |
| GET | /api/organization/capabilities | Configuración base y capacidades |
| GET | /api/branches | Búsqueda, filtros, paginación |
| GET | /api/branches/options | Selector con cursor, solo activas |
| GET | /api/branches/my-access | Sucursales disponibles para el usuario |
| GET | /api/branches/:id | Detalle + configuración |
| POST | /api/branches | Registrar sucursal y configuración atómicamente |
| PATCH | /api/branches/:id | Actualizar contacto y zona horaria |
| PATCH | /api/branches/:id/status | Activar / desactivar (con motivo) |
| GET | /api/branches/:id/config | Configuración operativa |
| PATCH | /api/branches/:id/config | Actualizar configuración |
| GET | /api/branches/:id/overview | Conteos de recursos relacionados |
| GET | /api/devices | Dispositivos filtrados y paginados |
| GET | /api/devices/options | Selector con cursor y tipo |
| GET | /api/devices/:id | Ficha del dispositivo |
| POST | /api/devices | Registrar terminal |
| PATCH | /api/devices/:id | Editar terminal |
| PATCH | /api/devices/:id/status | Activar / desactivar terminal |

### Filtros y respuestas

```http
GET /api/branches?page=1&limit=20&search=central&activo=true
GET /api/branches/options?search=sur&limit=20
GET /api/branches/my-access
GET /api/devices?page=1&limit=20&sucursalId=<id>&tipo=POS
GET /api/devices/options?sucursalId=<id>&tipo=KDS
GET /api/branches/<id>/overview
```

Los listados responden con `{data, meta:{page,limit,total,totalPages}}`.
Los selectores responden con `{data, meta:{hasMore,nextCursor}}`.
El filtro `activo` solo acepta `true` o `false`.
El cursor se aplica bajo el alcance autorizado sin posibilidad de
invalidar los filtros de sucursal. Una página sin recursos
autorizados devuelve `data: []`, no información de otra sucursal.

### Ejemplo de sucursal

```http
POST /api/branches
Authorization: Bearer <accessToken>
Content-Type: application/json

{"codigo":"NORTE","nombre":"Sucursal Norte","zonaHoraria":"America/Guatemala"}
```

La respuesta contiene datos de la sucursal y un bloque `configuracion`.
El código no se edita una vez creado. La configuración se modifica mediante:

```http
PATCH /api/branches/<id>/config
Content-Type: application/json
Authorization: Bearer <accessToken>

{"horaCorteOperativo":"04:00","permiteStockNegativo":false,"exigeCobroAntesPreparar":false}
```

### Ejemplo de dispositivo

```http
POST /api/devices
Content-Type: application/json
Authorization: Bearer <accessToken>

{"sucursalId":"<id>","codigo":"POS-01","nombre":"Terminal principal","tipo":"POS"}
```

Tipos admitidos: `POS`, `KDS`, `QUIOSCO`, `PANTALLA_TURNOS`,
`IMPRESORA` y `OTRO`. Una estación solo se asocia a KDS y debe
pertenecer a la misma sucursal. Registrar una impresora no instala
drivers, ni la autentica ni conecta físicamente al sistema.

### Activar o desactivar

```http
PATCH /api/branches/<id>/status
Content-Type: application/json
Authorization: Bearer <accessToken>

{"activa":false,"motivo":"Suspensión operativa"}
```

La desactivación se rechaza cuando hay órdenes abiertas, turnos de caja
abiertos, entregas pendientes o en reparto, transferencias en tránsito,
reservas futuras pendientes/confirmadas o requisiciones abiertas.
No cierra automáticamente negocios pendientes; mantiene todo el histórico.
Los próximos módulos operativos también deben validar `Sucursal.activa`
en sus respectivas operaciones para hacer efectivo el bloqueo.

Se prohíbe modificar valoración de inventario con movimientos ya
registrados. No se permite cambiar moneda base con pagos/ventas/movimientos
financieros, ni moneda de sucursal con órdenes/pagos previos. Cambiar la
hora de corte con cierres existentes se rechaza por integridad histórica.

## Arquitectura y límites

- `OrganizationService`: aplicación; filtra consultas por permisos.
- `OrganizationRepositoryPort`: contrato que consume la aplicación.
- `PrismaOrganizationRepository`: Prisma 7, transacciones SERIALIZABLE,
  verificación de permisos en escritura, auditoría.
- `organization.policy.ts`: código, hora, moneda, zona horaria y vínculo KDS.
- `OrganizationModule`: dependencia de Auth y Prisma; exporta servicio y puerto.

`branches/my-access` puede ser consultado por cualquier usuario
autenticado y retorna únicamente sucursales **activas** a las que
tiene un rol válido; los roles globales conceden cobertura global.
No es un permiso nuevo ni una prueba de autorización para otras rutas.

Este módulo **no** implementa todavía pairing criptográfico de
dispositivos, telemetría, comunicación con impresoras o sincronización KDS.
Son capacidades de etapas posteriores y requieren sus propias reglas.

## Pruebas pendientes fuera de CI

La compilación, Vitest unitario y el HTTP smoke test no equivalen a una
prueba completa contra la base PostgreSQL real. Validar CRUD, auditoría,
roles de diferentes sucursales, migración, cierre de caja y el enlace KDS
en una base de desarrollo antes del despliegue productivo.
