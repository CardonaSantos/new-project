# Hexagonal module conventions

For each business context (catalog, orders, kitchen, inventory, cash-register, delivery):

```
src/modules/<context>/
  domain/                 # business rules, types and aggregates
  application/
    ports/                # dependency contracts/tokens
    use-cases/            # orchestration of business rules
  infrastructure/
    prisma/               # adapters implementing application ports
  http/
    dto/                  # request validation and transport objects
    controllers/          # NestJS transport only
  <context>.module.ts     # Nest providers and imports
```

Rules:
- Domain/application never import `@prisma/client`, generated models, controllers or HTTP DTOs.
- Infrastructure imports `PrismaModule` and maps rows to application/domain types.
- Controllers translate requests to application use cases, not directly to Prisma.
- Use one transaction for logically atomic writes; avoid arbitrary generic repositories.
- Cross-module interactions go through public application ports/contracts.
- Do not add extra approval states to normal business operations.
- Avoid creating folders or services until required.
