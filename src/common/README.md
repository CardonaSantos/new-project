# Cross-cutting utilities

Reserved directories:
- decorators/ (reusable HTTP metadata)
- guards/ (authentication and authorization)
- filters/ (exception translation)
- interceptors/ (cross-cutting request handling)
- pipes/ (custom input validation)

Use built-in NestJS facilities unless a real need exists.
Do not place domain business logic here.
The global ValidationPipe is configured in src/main.ts.
