# DEL-A / D1 — Pruebas Postman DEV
1. Revisar que `DATABASE_URL` y `DIRECT_URL` correspondan exclusivamente a PostgreSQL DEV, sin compartir credenciales.
2. Consultar `npm run prisma:status`; revisar respaldos, duplicidad de direcciones principales y SQL de la migración `20261029195000_del_a_customer_scope` antes de aplicar.
3. Tras confirmar el destino DEV: `npm run prisma:deploy` y `npm run prisma:seed`. No ejecutar contra producción.
4. Importar `Gastro_Core_DEL_A_D1.postman_collection.json`. Configurar `baseUrl`, `token`, `sucursalId`. La prueba 12 necesita `otherToken` de un usuario restringido y `otherSucursalId`; se omite si no están.
5. Ejecutar secuencialmente 00–15. La variable `runKey` permite reintento exacto: eliminarla antes de una nueva batería de datos.
6. Comprobar en PostgreSQL que hay una sola dirección principal activa por cliente y que una segunda inserción concurrente no lo rompe; la CI ya incluye una prueba SQL de unicidad en PostgreSQL efímero.
7. Probar ORD-A con `clienteId` de la sucursal autorizada, de otra sucursal y cliente inactivo. Solo el primero debería poder asociarse. Las pruebas ORD-A requieren una variante de catálogo existente.
8. Compartir las respuestas sin JWT ni datos personales. Registrar resultados y actualizaciones de CI en el issue #13 y PR #14, sin cerrar D1 antes de validar DEV.

El contrato HTTP usa prefijo `/api` y listas paginadas `{data,meta}`. Repetir misma clave con otro payload debe devolver 409; todos los datos históricos deben preservarse.
