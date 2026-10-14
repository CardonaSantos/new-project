# MediaModule

Cargador hexagonal reutilizable de imágenes, documentos PDF y videos.
Las relaciones con perfil, producto, variante, inventario y categoría permanecen
en sus propios módulos. `MediaService` puede importarse y reutilizarse desde ellos.

## DigitalOcean Spaces (.env)
Se mantienen los nombres del cargador del CRM:

```dotenv
DO_SPACES_REGION=sfo3
DO_SPACES_ENDPOINT=https://sfo3.digitaloceanspaces.com
DO_SPACES_KEY=<access-key>
DO_SPACES_SECRET=<secret>
DO_SPACES_BUCKET=<bucket>
DO_SPACES_CDN_BASE=https://<bucket>.sfo3.cdn.digitaloceanspaces.com
MEDIA_BASE_PREFIX=gastro-core
MEDIA_DIRECT_MAX_MB=20
MEDIA_VIDEO_MAX_MB=200
```

Credenciales necesarias antes de iniciar NestJS; no se valida bucket con
HeadBucket al arrancar (evita caídas por intermitencia de red). Usa una
access key de mínimo privilegio R/W/Delete Objects para el bucket.

## Contratos
- POST /api/media/upload: `multipart/form-data`, campo `file`; `contexto`,
  `sucursalId` opcional, `publico=false` opcional. Imágenes <=10 MB,
  PDF <=20 MB; videos pequeños <=20 MB.
- POST /api/media/presign: JSON `{mime,nombre,sizeBytes,contexto,sucursalId,publico}`.
  Solo MP4/WebM; el navegador debe hacer PUT a `uploadUrl` con Content-Type
  exacto y posteriormente POST /api/media/:id/confirm.
- POST /api/media/:id/confirm: verifica tamaño, MIME real y objeto remoto.
- GET /api/media?page=1&limit=20&sucursalId=<id>: lista paginada.
- GET /api/media/:id: metadatos.
- GET /api/media/:id/access: URL pública o firmada durante cinco minutos.
- DELETE /api/media/:id: elimina de Spaces por bucket+claveObjeto y marca
  soft-delete, rechazando media vinculada a perfiles/productos.
- Autenticación Bearer en todas las rutas. Permisos evaluados EN EL CASO DE USO
  sobre el alcance real del recurso, no sobre un header modificable.
- Permisos: `media.read`, `media.upload`, `media.delete`, `media.publish`.
  Deben agregarse al catálogo idempotente del seed actual con
  `npm run prisma:seed` tras migrar.
- Documentos PDF y cualquier media son privados por defecto. Solo imagen y
  video pueden marcarse públicos por usuarios con `media.publish`.

## Firma, tamaño y protección
Se comprueban firmas binaras con file-type; no se aceptan SVG, HTML ni scripts.
SHA-256 se guarda para multipart recibido por el backend. Video grande va
directo al bucket mediante URL firmada y no se descarga completamente para
calcular su hash; se verifica firma inicial y HeadObject. ETag NO es SHA-256.
No se incluyen bytes en base de datos.

Para videos grandes, la URL PUT dura dos minutos y la confirmación debe
ocurrir dentro de quince minutos. Se requiere CORS en el bucket para el
origen de Angular, método PUT y cabecera Content-Type.

Un objeto reservado y no confirmado debe purgarse periódicamente; implementar
su mantenimiento antes de escalar uploads directos a clientes externos.

La carga a través del backend utiliza Multer en memoria con límite estricto
de 20 MiB. Videos grandes no pasan por la RAM del servidor.
