# Auth (pending business implementation)

This folder is reserved for the authentication **bounded context**, not a fake login endpoint.

Recommended structure when the user model and permission rules are approved:

- `domain/`: entities and policies; no NestJS/Prisma imports.
- `application/ports/`: repositories and token/password ports.
- `application/use-cases/`: sign-in, sign-out, change permission, revoke session.
- `infrastructure/prisma/`: database adapter implementing ports.
- `infrastructure/security/`: password hashing and token/session adapters.
- `http/`: controllers, DTOs, guards and authorization decorators.
- `auth.module.ts`: dependency-injection wiring.

Enforce authorization on every request in the server, not just in the UI.
Avoid storing permissions only inside long-lived JWTs; support live revocation.
