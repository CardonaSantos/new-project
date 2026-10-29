# DEL-A D1 ↔ ORD-A — Ejecución de integración Postman (DEV)

## Precondiciones
1. Estar en `feat/del-a-customers-delivery` con el nuevo commit de integración; compilar y levantar el backend sobre **PostgreSQL DEV ya migrado**. **Esta entrega no incluye migración ni seed nueva**; no repetir Prisma si tu base está al día.
2. Importar `Gastro_Core_D1_ORD_A_Integration.postman_collection.json` desde esta carpeta.
3. Establecer `baseUrl=http://localhost:3000`, JWT `token` con permisos `orders.create`, `orders.manage`, `orders.read`, `customers.create`, `customers.read`, `customers.manage`, y el `sucursalId` de tu sucursal DEV.
4. Ejecutar solicitud 00 para ver catálogo de variantes. Seleccionar manualmente un `varianteId` **vendible en esa sucursal y con precio vigente**. No es seguro asumir que la primera variante sirve; puedes comprobar catálogo/variante desde Swagger. Mantener `enviarCocina:false` para no preparar ni consumir stock.
5. Ejecutar 01–13 **en orden** (14 opcional). Se crean clientes y órdenes **reales en DEV**. No usar producción. Las pruebas de rechazo 06,07,09,10 deben arrojar respectivamente 409,404,409,404 y **no** crear ni cambiar pedidos.
6. Si quieres repetir toda la colección desde cero, **borra** `integrationRun` (y los IDs guardados); eso generará nuevas órdenes de prueba. Si repites una solicitud individual, conserva la clave para comprobar idempotencia.
7. La prueba 14 exige `restrictedToken` de un usuario que tenga `orders.create` pero **no** `customers.read`. Sin ese JWT se omite; no necesitas segunda sucursal. Para multisucursal real, crearla posteriormente en un entorno aislado.
8. Revisa `integrationOrderId` y `integrationOrderVersion` tras el paso 04. Si cambian los estados o versiones por intervención externa, las ediciones 09–11 pueden devolver 409 por concurrencia; ejecuta sobre una orden creada por esta colección y sin otras modificaciones.
9. No copiar JWT ni datos personales reales al PR. Comparte resumen de Postman y las respuestas de error con el backend.

## Semántica confirmada del nuevo código
- ORD-A reutiliza exactamente la transacción SERIALIZABLE de Orders para autorizar sucursal/rol/cliente. No abre otra transacción para la comprobación.
- Clientes ajenos a la sucursal se tratan como 404 sin exposición de datos, clientes inactivos como 409 y roles sin `customers.read` como 403.
- Los pedidos sin `clienteId` continúan siendo válidos. Una orden abierta permite editar `clienteId` con `version` vigente.
- No modifica `prisma/schema.prisma`, migraciones ni seed; no lanzar comandos de migración en esta etapa.

## Comandos PowerShell
```powershell
git switch feat/del-a-customers-delivery
git pull --ff-only origin feat/del-a-customers-delivery
git log -1 --oneline
npm run build
npm run start:dev
```
