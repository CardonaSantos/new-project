# Auth — bounded context
domain/ policy independiente (se ampliará al introducir casos).
application/ casos de uso y puertos de identidad, hashing y tokens.
infrastructure/ adaptador Prisma, Argon2id y JOSE.
presentation/http/ DTOs, controllers, decorators y guards.
Los guards APP_GUARD protegen nuevas rutas por defecto. Usar @Public() solo en rutas intencionalmente públicas.
No usar hashes enviados por la UI: enviar contraseñas sobre HTTPS y aplicar Argon2id en el servidor.
Refresh: cookie HttpOnly (path /api/v1/auth), SameSite Lax, Secure en producción. JS no lee refresh token.
Roles GLOBAL se representan con sucursalId null. Revisar índice parcial SQL para evitar duplicados en PostgreSQL.
