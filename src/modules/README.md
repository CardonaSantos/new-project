# Modularidad hexagonal — Gastro Core

Módulos de negocio bajo `src/modules/<context>/`:

```
domain/                  Reglas puras del negocio, sin ORM ni HTTP
application/ports/       Contratos de persistencia y servicios externos
application/             Casos de uso, comandos, orquestación
infrastructure/prisma/   Repositorios y mappers de filas
infrastructure/security/ Adaptadores de seguridad (si aplica)
presentation/http/       Controllers, DTOs, guards y decoradores
<context>.module.ts      DI y límites públicos de módulo
```

Los módulos importan `PrismaModule` solamente desde infraestructura.
`shared/domain` contiene funciones puras transversales (decimales y validación de transiciones).
`shared/mappers` contiene solo mappers realmente compartidos; los específicos del módulo
se mantienen junto a su adaptador.

No crear capas vacías por estética, repositorios genéricos obligatorios ni estados innecesarios.
Controllers no contienen reglas ni acceden a Prisma directamente.
Secretos, contraseñas y tokens nunca pasan a logs ni auditorías.
