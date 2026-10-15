import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject, type OperationObject } from '@nestjs/swagger';

/**
 * Swagger describes routes; it does not replace AuthGuard or permission checks.
 * In production it is disabled unless explicitly opted in.
 */
export function swaggerEnabled(nodeEnv?: string, flag?: string): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return nodeEnv !== 'production';
}

const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
const publicOperations = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
]);

function tagFor(path: string): string {
  if (path.startsWith('/api/auth/')) return 'Autenticación y sesiones';
  if (path.startsWith('/api/media')) return 'Archivos y multimedia';
  if (path.startsWith('/api/users/reports')) return 'Personal · Reportes';
  if (path.startsWith('/api/users')) return 'Usuarios y personal';
  if (path.startsWith('/api/roles')) return 'Roles';
  if (path.startsWith('/api/permissions')) return 'Permisos';
  if (path.startsWith('/api/organization')) return 'Organización · Empresa';
  if (path.startsWith('/api/branches')) return 'Organización · Sucursales';
  if (path.startsWith('/api/devices')) return 'Organización · Dispositivos';
  if (path.startsWith('/api/inventory/units')) return 'Inventario · Unidades';
  if (path.startsWith('/api/inventory/conversions')) return 'Inventario · Conversiones';
  if (path.startsWith('/api/inventory/articles')) return 'Inventario · Artículos';
  if (path.startsWith('/api/inventory/warehouses')) return 'Inventario · Almacenes';
  if (path.startsWith('/api/inventory/locations')) return 'Inventario · Ubicaciones';
  if (path.startsWith('/api/inventory/reports')) return 'Inventario · Reportería INV-A';
  if (path.startsWith('/api/catalog/reports')) return 'Catálogo · Reportería';
  if (path.startsWith('/api/catalog/categories')) return 'Catálogo · Categorías';
  if (path.startsWith('/api/catalog/products')) return 'Catálogo · Productos';
  if (path.startsWith('/api/catalog/variants')) return 'Catálogo · Variantes';
  if (path.startsWith('/api/catalog/modifier-groups')) return 'Catálogo · Grupos';
  if (path.startsWith('/api/catalog/modifiers')) return 'Catálogo · Modificadores';
  if (path.startsWith('/api/catalog/prices')) return 'Catálogo · Precios';
  if (path.startsWith('/api/catalog/menus')||path.startsWith('/api/catalog/menu')) return 'Catálogo · Menús';
  if (path.startsWith('/api/health')) return 'Sistema';
  return 'Otros';
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Gastro Core API')
    .setDescription(
      'Documentación interactiva del backend Gastro Core. Autenticación JWT Bearer; ' +
      'el refresh usa cookie HttpOnly. Algunas operaciones requieren permisos RBAC ' +
      'y contexto de sucursal. Inventario INV-A incluye maestros y no publica Kardex ni saldos.'
    )
    .setVersion('0.1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Pegue solamente accessToken obtenido de POST /api/auth/login, sin el prefijo Bearer.',
    }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    operationIdFactory: (controller, method) => `${controller}_${method}`,
  });
  // All routes require Bearer by default. The only public routes are listed above.
  document.security = [{ 'access-token': [] }];
  const tags = new Set<string>();
  for (const [path, item] of Object.entries(document.paths)) {
    if (!item) continue;
    for (const method of methods) {
      const operation = item[method] as OperationObject | undefined;
      if (!operation) continue;
      const tag = tagFor(path);
      tags.add(tag);
      operation.tags = [tag];
      if (publicOperations.has(`${method.toUpperCase()} ${path}`)) {
        operation.security = [];
      } else if (
        path.startsWith('/api/users') ||
        path.startsWith('/api/branches') ||
        path.startsWith('/api/devices') ||
        path.startsWith('/api/inventory') ||
        path.startsWith('/api/media')
      ) {
        // The header only selects context. Permissions are checked by the backend.
        operation.parameters = [
          ...(operation.parameters ?? []),
          {
            name: 'x-sucursal-id',
            in: 'header',
            required: false,
            description: 'Sucursal seleccionada cuando se opera con permisos de alcance SUCURSAL. No concede permisos.',
            schema: { type: 'string' },
          },
        ];
      }
    }
  }
  document.tags = [...tags].sort().map(name => ({name}));
  return document;
}

/**
 * UI: /api/docs
 * Machine-readable: /api/docs/openapi.json and /api/docs/openapi.yaml
 * Routes continue to live under /api/*; no additional API prefix is added.
 */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: 'api/docs/openapi.json',
    yamlDocumentUrl: 'api/docs/openapi.yaml',
    customSiteTitle: 'Gastro Core · Swagger',
    swaggerOptions: {
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
