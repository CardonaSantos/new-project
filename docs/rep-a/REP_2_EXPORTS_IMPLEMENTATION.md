# Gastro Core — REP-2: exportaciones reales CSV, XLSX y PDF

**Rama:** `feat/rep-a-reporting`. **PR #18:** DRAFT, no merge. **Fecha:** 2026-10-30.

## Endpoint

```http
GET /api/reports/analytics/exports/:source?sucursalId=cmv8p4k3x0001u4v4xor2zgqu&periodo=PERSONALIZADO&desde=2026-10-01&hasta=2026-10-30&format=CSV
```

`format`: `CSV`, `XLSX` o `PDF`; `:source` usa las mismas **15 fuentes permitidas** de `/api/reports/analytics/sources/:source`. No se admite un origen arbitrario ni acceso a información de otras sucursales. No hay nuevos permisos ni tablas.

**Autorización:** `DomainReportsService.exportRecords` valida fuente contra allowlist y `DomainReportsStore.exportRecords` vuelve a usar `context()` por cada página: `reports.read` más permiso específico de la fuente; `SALES_COSTS` exige además `inventory.costs.read`; `ORDER_COST_OUTCOMES` exige `orders.read`. Si no hay acceso, no se produce un archivo.

**Integridad de datos:** las páginas (100 filas máximo por consulta) se recopilan **en una única transacción PostgreSQL `REPEATABLE READ`**, con snapshot coherente, para exportar la fuente COMPLETA sin depender de la página visible. Se rechazan los períodos superiores a **1000 filas** con 413, sin emitir un archivo truncado; también se verifica que la cantidad de filas recibidas concilie con `meta.total`. Si la serialización supera **5 MB**, rechazar con 413. El PDF dispone de límite de 500 páginas y también rechaza volúmenes excesivos.

## Formatos

- **CSV:** UTF-8 con BOM para Excel, columnas unificadas del reporte y filas del snapshot, escapado RFC-style de comillas/campos, CRLF; prefijo neutralizador de fórmula si el texto comienza por `=`, `+`, `-`, `@` o caracteres de control, salvo números negativos válidos. Objetos anidados serializados como JSON. No hay fórmulas ni macros ejecutables.
- **XLSX:** documento Office Open XML real con ZIP interno, dos hojas (`Datos` y `Resumen`). `Datos` contiene todas las columnas y todos los registros, fila final con fórmulas `SUM` en columnas íntegramente numéricas; formatos de números enteros, 2 y **6 decimales** para conservar visualmente la precisión de costos. `Resumen` incluye origen, sucursal, moneda, período, registros, tipo de snapshot y totales originales del reporte como JSON. Celdas de texto tipadas `inlineStr` (no interpretar cadenas maliciosas como fórmulas). Excel recalcula fórmulas al abrir.
- **PDF:** PDF 1.4 real en paisaje A4, con páginas y paneles de hasta 6 columnas para mostrar todas las columnas de fuentes amplias. Los valores de celdas se **envuelven en líneas sucesivas, sin cortarlos silenciosamente**; repetir encabezados en cada página. Fuente Courier con WinAnsiEncoding para caracteres latinos comunes. PDF y XLSX se generan en servidor sin dependencias adicionales.
- **Auditoría:** cada exportación exitosa escribe `EventoAuditoria` con `accion=REP_EXPORT_GENERATED`, `usuarioId`, `sucursalId`, `entidad='REPORTE'`, fuente, formato, período, cantidad de filas, tamaño en bytes y hash SHA-256 del archivo. Nunca almacenar filas completas en auditoría. Si falla la escritura, no se entrega el archivo. HTTP fija `Cache-Control: private, no-store, max-age=0`, `Content-Disposition: attachment`, `Content-Length`, `X-Report-SHA256` y `nosniff`.

## Pruebas

- Unit `src/modules/reports/application/report-export-formats.spec.ts`: CSV UTF-8/inyección, ZIP y rutas XLSX/estilos/formulas, PDF xref/páginas/paneles, conjuntos vacíos.
- HTTP `test/report-exports.e2e-spec.ts`: CSV/PDF como attachment, Content-Type, Cache-Control, cabecera SHA-256, auditoría, errores de parámetros y falta de sucursal.
- Revisión CI del **último HEAD** obligatoria. La colección [REP-2 DEV](Gastro_Core_REP_2_EXPORTS_DEV.postman_collection.json) contiene **8 solicitudes**: 6 formatos y fuentes, 2 negativas (TXT y falta sucursal). Al descargar XLSX/PDF usar **Send and Download** y abrir cada archivo en lector de Excel y PDF para prueba humana; verificar fórmulas y contenido completo.
- Comparar registros y totales exportados contra el GET JSON de la misma fuente y período. Para fuentes que tienen campos anulables, distinguir `null` de cero en el origen; objetos anidados se representan como JSON dentro de una celda, no como filas duplicadas.
- Test adicional futuro: usuario sin `reports.read`, sin `inventory.costs.read`, otra sucursal, >1000 registros reales, fórmulas en una fuente numérica de 6 decimales, compatibilidad de Excel/LibreOffice y PDF con diacríticos.

## Gate de cierre del módulo

R5 y R6 fueron aprobados contra 9 respuestas DEV el 30/10 (ver `2026-10-30_REP_A_R5_R6_DEV_ACCEPTANCE.md`). **REP-2 está desarrollado pero sus archivos descargados todavía requieren prueba real DEV**. No declarar todo REP-A cerrado, ni publicar merge de PR #18, hasta validar archivos reales CSV/XLSX/PDF, auditoría, seguridad RBAC, casos representativos y gate de aceptación final.
