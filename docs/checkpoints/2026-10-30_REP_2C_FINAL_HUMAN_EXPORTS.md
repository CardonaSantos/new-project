# Gastro Core — REP-2C, último refactor de reportes operativos

Fecha de trabajo: 2026-10-30 (hora local Guatemala). Repo `CardonaSantos/new-project`, rama `feat/rep-a-reporting`, PR #18 **DRAFT** y sin merge.

## Archivos DEV recibidos y resultados comprobados

El usuario aportó 9 archivos originales (CSV/XLSX/PDF) de `SALES_COSTS` (mes y 30/10), `ORDER_COST_OUTCOMES`, `PAYMENT_SALES_RECON` (mes y día) y `SUPPLIER_BALANCES`. Se revisaron los XML de las hojas originales, los PDF con extracción y render y los CSV. Los datos de mes concilian con REP-1:

- 8 VentaLinea por ingresos **Q154.00**, costo directo histórico identificado **Q10.799999**, margen antes de empaque **Q143.200001**.
- Una venta del 30/10 por **Q22.00**, costo directo **Q1.542857**, margen previo a empaque **Q20.457143**.
- En el PDF diario de cobros del 30/10 aparecen **4 pagos por Q88.00** y **3 cuentas sin Venta**, con diferencia de reconocimiento de Q66, sin inferir error financiero.
- Costos de consumo de órdenes: **Q16.928570** de 9 documentos, incluyendo consumos ligados a cancelaciones **Q6.128571**.
- En las salidas anteriores había IDs UUID/CUID extensos en Excel y CSV, muchos campos técnicos y fechas ISO, sin formato Q en Excel/PDF; informes diarios de 3 páginas con una hoja de día redundante. Estos son **problemas de presentación**, no evidencia de importes mal calculados.

## REP-2C código implementado

- `professional-export-model.ts`: identifica importes monetarios de forma distinta de cantidades y conteos; etiqueta campos y KPIs en español; elimina `id`/`*Id`/`documentosConsumo` de las columnas visibles **sin borrar sus referencias reales de BD**; fecha local Guatemala, estado legible, nombres comerciales preservados literalmente, encabezado explícito `REPORTE DEL DÍA • 30/10/2026`.
- `professional-xlsx.ts`: importes Excel numéricos reales (`<v>...`), con formatos de número personalizados `"Q" #,##0.00` y `"Q" #,##0.000000`; USD si corresponde. Celdas sumables, fórmulas `SUM`, precisión exacta de 6 decimales en costos, cantidades con su formato numérico no monetario. Hoja `Resumen` simplificada a cuatro columnas y dos indicadores por fila, hoja `Diario` con fecha visible, hoja `Detalle` sin columnas ID y con filtros/anchos/wrap. Paleta reducida a azul oscuro, blanco y gris tenue.
- `professional-pdf.ts`: símbolo Q y cifras visibles de dos decimales (precisión de 6 decimales recuperable en Excel), portada compacta con indicadores, día consultado prominente, totales del día en primera página; en `DIA` se elimina página de día redundante, pasando a portada/resumen y detalle. Informe de período mantiene resumen diario en página propia cuando hay fechas verificables. Máximo seis campos comerciales por tabla para evitar columnas comprimidas e IDs. Fechas convertidas al día/hora de Guatemala, sin largas cadenas ISO ni secciones vacías sin utilidad. Paleta sobria.
- `report-export-formats.ts`: CSV UTF-8 BOM con encabezados comerciales, indicador `(Q)` en columnas de moneda, números crudos para que Excel y otros sistemas puedan operar con ellos; fechas legibles y IDs técnicos omitidos.
- Se mantienen auditoría `REP_EXPORT_GENERATED`, hash SHA256, 15 fuentes autorizadas, permisos por sucursal, snapshot `REPEATABLE READ`, cap de 1000 filas y 5 MB. Sin nuevas migraciones.
- Tests renovados `report-export-formats.spec.ts` y `prisma/ci/rep-2b-ooxml-validate.py`, incluyendo formatos Q OOXML, fechas locales, ausencia IDs, PDF diario de dos páginas y nombres comerciales íntegros.

## Única validación siguiente

Nueva colección [REP-2C Postman, 11 solicitudes](../rep-a/Gastro_Core_REP_2C_EXPORTS_FINAL_DEV.postman_collection.json). Con sucursal `cmv8p4k3x0001u4v4xor2zgqu`, mes 2026-10-01..2026-10-30 y `fecha=2026-10-30`.

Gate indispensable:
1. CI SUCCESS en HEAD final (tests + SQL + validador binario).
2. **SÍ traer local una sola vez al llegar al gate:** `git status`; `git fetch origin`; `git switch feat/rep-a-reporting`; `git pull --ff-only origin feat/rep-a-reporting`; `git log -1 --oneline`; `npm run start:dev`.
3. Postman: 11 requests, 9 descargas (mes y día) y 2 negativas (400). Abrir XLSX con Excel sin reparaciones. Comprobar celdas `Q 22.00` como números (fórmulas/suma), detalle sin IDs, encabezado de día, PDF compacto con valores y fecha legibles, CSV sin IDs y números en columna `Ingresos (Q)`.
4. Aceptación del usuario antes de merge PR #18.

**REP-2C no se declara cerrado sin confirmación de archivos reales DEV.**
