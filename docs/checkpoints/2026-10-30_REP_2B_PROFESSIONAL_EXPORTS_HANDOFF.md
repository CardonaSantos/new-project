# Gastro Core — Checkpoint REP-2B: exportaciones profesionales

Fecha: 2026-10-30. Repo `CardonaSantos/new-project`. Rama `feat/rep-a-reporting`, PR #18 **DRAFT, SIN MERGE**.

## Evidencia de rechazo inicial
El usuario descargó archivos REP-2 en DEV y adjuntó ejemplos XLSX/PDF/CSV. Excel 2013 reportó reparación de `xl/styles.xml` y datos de hojas `sheet1.xml`/`sheet2.xml`; además los anchos y jerarquía eran pobres. Los PDF imprimían IDs repetidos en páginas artificiales `Columnas 1-6, 7-12`, sin reportes diarios ni presentación gerencial. Por ello REP-2 original NO estaba aceptado.

## Refactor implementado
- Nuevo núcleo: `professional-export-model.ts` (métricas, etiquetas, columnas de negocio, agrupación por fecha operativa con precisión Decimal).
- Nuevo Excel: `professional-xlsx.ts` reemplaza el serializador XLSX antiguo. Tres hojas `Resumen` (KPIs y semántica), `Diario` (fecha operativa o mensaje explícito si no hay fecha verificable), `Detalle` (todos los campos de la fuente, prioridad comercial, IDs técnicos después, anchos específicos, fórmulas SUM, filtros, freeze y filas alternadas). Estilos OOXML reordenados correctamente según esquema, de `numFmts` a `cellStyles` y formatos 2/6 decimales.
- Nuevo PDF: `professional-pdf.ts` con portada ejecutiva, tarjetas de indicadores, páginas de información diaria y páginas de detalle legibles, encabezados/pies, campos de negocio prioritarios y saltos de página seguros. Se evita repetir paneles enormes de IDs; IDs íntegros siguen en XLSX/CSV. Reporte de un día: `periodo=DIA&fecha=YYYY-MM-DD`.
- CSV: conserva detalle de fuente técnico con BOM, escapes e inyección controlada, apropiado para importaciones.
- `export-daily.ts` calcula en la transacción de exportación `REPEATABLE READ`:
  - cobros por `Pago.cobradoEn`, reembolsos del día por `ReembolsoPago.creadoEn` (no confundir con reembolsos históricos de cohorte);
  - costos de inventario consumidos por `ConsumoOrden.creadoEn` y `MovimientoInventario.costoTotal`;
  - `SALES_COSTS` por `Venta.cerradaEn` ya incluido en filas, con agregación decimal de seis posiciones.
- `report-export-formats.ts` ahora es un adaptador mínimo con escritores profesionales y CSV existente. No hay nuevas migraciones, tablas ni paquetes npm.
- `domain-reports.store.ts` incluye `diario` en la misma instantánea autorizada de exportación, sin alterar los límites anteriores de 1000 filas y 5 MB.
- Tests actualizados `report-export-formats.spec.ts`; pruebas binarios CI a través de `prisma/ci/rep-2b-format-fixture.ts`, `prisma/ci/rep-2b-ooxml-validate.py`, validación de cabeceras, sheets, styles, ZIP, PDF y CSV. Smoke SQL real del agregado diario en `prisma/ci/rep-a-r5-r6-query-smoke.ts`.
- [Colección Postman REP-2B, 11 solicitudes](../rep-a/Gastro_Core_REP_2_EXPORTS_DEV.postman_collection.json): 8 iniciales y 3 nuevas para **DIA** (XLSX de SALES_COSTS; PDF SALES_COSTS; PDF PAYMENT_SALES_RECON). Configurar fecha 2026-10-30 y sucursal principal; los 2 errores 400 son esperados.
- [Especificación REP-2B](../rep-a/REP_2B_PROFESSIONAL_EXPORT_REFACTOR.md).

## Gate de validación antes de cerrar
1. Confirmar CI SUCCESS sobre **último HEAD**, incluido el paso Python OOXML, smoke SQL y HTTP.
2. **Una sola sincronización local** posterior a CI: `git status`; `git fetch origin`; `git switch feat/rep-a-reporting`; `git pull --ff-only origin feat/rep-a-reporting`; `git log -1 --oneline`. Ejecutar `npm run start:dev` si hace falta.
3. En DEV ejecutar la colección REP-2B (11 solicitudes). Guardar/abrir XLSX y PDFs con **Send and Download**; verificar Excel sin reparaciones, hojas Resumen/Diario/Detalle, anchos reales, fórmulas, PDF portada/día/detalle, CSV con BOM y compatibilidad de acentos. Validar reportes mensual y DIA.
4. Comprobar auditoría de exportaciones y SHA256; revisar controles de RBAC y caso de más de 1000 registros. Solo después cerrar REP-2 y REP-A y solicitar aprobación de merge.
5. R5 y R6 ya aprobados contra respuestas DEV en `docs/rep-a/2026-10-30_REP_A_R5_R6_DEV_ACCEPTANCE.md`. No confundir esta aceptación con REP-2B, aún pendiente de la prueba visual real.

**No merge de PR #18 a main sin autorización expresa.**
