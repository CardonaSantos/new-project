# Reutilización sin sobreingeniería
- `domain/`: utilidades **puras** compartidas por varios bounded contexts (decimal y validaciones genéricas).
- `mappers/`: solo convertidores genéricos, sin lógica de productos ni sesiones.
- Cada módulo guarda sus mappers de Prisma en `infrastructure/prisma/mappers/`.
- Estados son dominio: no se mezclan con las respuestas HTTP.
- Evita crear helpers que solo usa un módulo. Mantén helpers concretos junto al dueño.
