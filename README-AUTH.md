# Auth v1 — operación segura y simple

Esta entrega contiene login, refresh rotativo mediante cookie HttpOnly, logout,
logout-all, cambio de contraseña temporal, me, capabilities y creación/asignación
de usuarios restringida por permisos.

## Configuración obligatoria

1. Actualiza Node a 24.15+.
2. `npm install`; revisa y versiona el nuevo package-lock.json.
3. Copia `.env.example` a `.env`, define DATABASE_URL, AUTH_ACCESS_SECRET
   aleatorio (mínimo 43 caracteres), BOOTSTRAP_ADMIN_PASSWORD (mínimo 12 caracteres).
4. Valida y genera Prisma: `npm run prisma:validate && npm run prisma:generate`.
5. Revisa y aplica la migración inicial **solo en una BD nueva y confirmada**:
   `npm run prisma:migrate -- --name init`.
6. Ejecuta `npm run prisma:seed` únicamente después de migrar.
7. `npm run start:dev`.

La contraseña inicial se define por entorno y nunca se imprime ni se comitea.
El seed crea `admin@novasistemas.net` y fuerza cambio de contraseña; al repetirlo
no modifica la contraseña existente ni crea cuentas duplicadas.
Solo el superadministrador global puede asignar roles. La autorización de
acciones está controlada por permissions y el alcance de sucursal.

## Angular / navegador
- POST /api/v1/auth/login body `{email,password}`; usar HTTPS.
- Access token únicamente en memoria; enviarlo como Authorization: Bearer.
- Refresh cookie HttpOnly. Configurar Angular HTTP con withCredentials para login/refresh.
- POST /api/v1/auth/refresh devuelve nuevo access token y rota refresh cookie.
- No guardar la contraseña ni un supuesto "hash de contraseña" en localStorage.
- El cookie usa SameSite=Lax y en producción Secure. Para UI en sitio distinto
  habrá que diseñar despliegue/cookie con CSRF, preferible mismo dominio/sitio.
- Cambiar contraseña invalida todas las sesiones y exige volver a iniciar.

## Seguridad / límites
- Guard global: todas las rutas requieren usuario activo y sesión no revocada;
  health, login y refresh se marcan explícitamente públicos.
- Rate limit de login por IP/correo: 7 intentos por combinación o 40 por IP
  en 15 minutos, persistido en `IntentoAcceso`. Hacer purga periódica.
- Roles GLOBAL requieren sucursalId null; SUCURSAL requieren sucursalId.
  Reforzar índices de asignaciones globales con SQL tras revisar migraciones.
- Para APIs del futuro, además del permiso, comprobar ownership de recurso
  y sucursal sobre cada entidad.
- La prueba e2e actual valida health sin PostgreSQL; falta una prueba de
  integración real Auth contra una BD efímera.
- Revocación inmediata exige que PostgreSQL esté accesible; no cachear
  decisiones de permisos sin invalidación.
