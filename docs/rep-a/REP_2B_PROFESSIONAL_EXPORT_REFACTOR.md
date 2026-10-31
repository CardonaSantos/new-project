# Gastro Core REP-2B — Refactor de exportaciones profesionales

Fecha: 2026-10-30. Repo: CardonaSantos/new-project. Rama: feat/rep-a-reporting. PR #18 DRAFT (no merge).

## Motivo del refactor

El usuario abrió el XLSX exportado de `SALES_COSTS` en Excel y recibió advertencia de reparación, incluyendo `xl/styles.xml` y celdas en dos hojas. La estructura anterior serializaba los elementos de `styles.xml` en un orden incorrecto (el nodo `numFmts` aparecía después de `cellStyleXfs`). También mostraba detalle sin anchos adecuados. Los PDF anteriores eran un volcado técnico dividido por bloques fijos de 6 columnas e IDs largos, poco útil para gerencia. La evidencia proviene de XLSX, CSV, PDF y captura de Excel DEV aportados por el usuario, período 2026-10-01..2026-10-30.

## Nuevo XLSX (sin paquetes npm adicionales)

Módulos:
- `src/modules/reports/application/professional-export-model.ts`: títulos, etiquetas legibles, selección de columnas de negocio y agregados de día operativos conservando 6 decimales.
- `src/modules/reports/application/professional-xlsx.ts`: escritor OOXML con ZIP+CRC, estructura de estilos válida y formato elegante azul petróleo/teal. **Tres hojas** por reporte:
  1. `Resumen`: título, sucursal, período, moneda, KPIs de fuente, aviso de semántica y trazabilidad.
  2. `Diario`: tabla por día operativo, con fuente cronológica verificable. Si el origen no tiene fecha fiable por registro, no inventa serie diaria.
  3. `Detalle`: toda la evidencia original, columnas de negocio primero, IDs técnicos después, anchos de columna personalizados, filas altas, texto ajustado, filtros, encabezado inmovilizado, alternancia de filas, números reales y fórmulas SUM para cantidades y costos.
- Corregido orden reglamentario `numFmts -> fonts -> fills -> borders -> cellStyleXfs -> cellXfs -> cellStyles`. Se conservan cifras financieras de 2 decimales y costos de 6 decimales. Textos que inician con `=` no se interpretan como fórmulas.
- XML y ZIP se generan internamente en la aplicación sin migraciones de BD ni nuevos paquetes.

## Nuevo PDF (información diaria, gerencial y legible)

Módulo `professional-pdf.ts`:
- A4 horizontal, tipografía Helvetica/Helvetica Bold, encabezado institucional azul petróleo, identidad visual sobria.
- Primera página: portada ejecutiva con cuatro indicadores, panorama y secciones del informe.
- Páginas de **información diaria**: tabla de movimientos por día operativo con fuente fidedigna, sin inventar fechas.
- Páginas de **detalle de negocio**: columnas prioritarias por reporte, nombres claros, filas con wrap, encabezados repetidos, franjas alternadas, numeración y pie. Los IDs de auditoría completos se mantienen accesibles en XLSX/CSV, no saturan el PDF.
- Valor/celda largo se envuelve; si supera límites seguros de formato devuelve error explícito, no archivo parcial. PDF no se corta por paneles 1-6, 7-12 sin contexto.

## Origen del resumen diario

`src/modules/reports/infrastructure/prisma/export-daily.ts` recopila **dentro del mismo snapshot REPEATABLE READ**:
- `PAYMENT_SALES_RECON`: suma `Pago.monto` por `Pago.cobradoEn`; reembolsos registrados por `ReembolsoPago.creadoEn`. Esto **no es** igual a `reembolsadoHistorico` de una cohorte de pagos, por lo que se etiqueta explícitamente.
- `ORDER_COST_OUTCOMES` y `PREPARATION_COSTS`: costos de movimientos `MovimientoInventario.costoTotal` ligados a cada `ConsumoOrden.creadoEn`, sumados por fecha operativa con validación de movimiento original. No es fecha de venta/cancelación.
- `SALES_COSTS` y fuentes con marca temporal por registro: se agregan las filas exportadas por fecha operativa de la sucursal, conservando la precisión Decimal y sin atribuir costos `null` como cero.
- Otras fuentes sin fecha verificable: detalle y resumen original, con aclaración de que no se generan fechas ficticias.

Para consultar **un solo día**, usar `periodo=DIA&fecha=YYYY-MM-DD` en el endpoint existente de exportación, con `format=XLSX` o `PDF`; ese archivo mostrará `Informe diario` en su cabecera. Para todo un período, `periodo=PERSONALIZADO&desde=...&hasta=...`, con pestaña/contenido `Diario`.

## CSV

Conserva identificadores técnicos y nombres de campos originales para auditorías e importaciones. UTF-8 con BOM, CRLF, citas escapadas y prevención de inyección de fórmulas. CSV no soporta estilos ni múltiples hojas por especificación.

## QA para cierre

- Tests unit: OOXML con 3 hojas, orden de estilos, fórmula SUM, IDs y cabecera, fechas/costos diarios, PDF con portada/diario/detalle sin paneles técnicos, CSV.
- CI PostgreSQL: prueba SQL real de agregaciones de cobros, reembolsos y consumo en una BD migrada.
- DEV: descargar nuevo XLSX, abrir **en Excel SIN advertencia de reparación** y comprobar las 3 hojas, orden/anchos, números, totales. Abrir PDF y verificar portada, resumen diario y legibilidad. Comparar un corte mensual y **un día**. Guardar PDF/Excel; si Excel repara algún XML, la prueba falla y REP-2B sigue abierto.
- El PR #18 no se debe fusionar antes de aceptar la salida visual y validar el audit SHA-256.
