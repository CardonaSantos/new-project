# Gastro Core — REP-A checkpoint R4/A: costos históricos trazables

Fecha: 2026-10-30. Rama `feat/rep-a-reporting`; PR #18 DRAFT, `main` sin merge de REP-A. Base: checkpoint R3 y validación DEV de 22/22 respuestas esperadas.

## Estado al iniciar

- REP-1 R3: 13 solicitudes iniciales + 9 transversales respondidas con JSON consistente, incluidas pruebas 400 esperadas y `RESERVATION_EVENTS` 200 al restablecer `reservations.read`. 3 ingresos de liquidaciones repartidor por Q22 = Q66 y cobros por plataforma Q22, cuatro `Pago` = Q88 vs una `Venta` cerrada Q22. La diferencia de reconocimiento debe verificarse por estado de orden y cierre; no sumar pagos + caja + liquidaciones como ventas.
- La CI del HEAD R3 `c997666ca3e227aabe2b824a0d80f8729b978d8d` terminó SUCCESS. R3 cerrado a nivel **respuestas HTTP suministradas**; no se compartió reporte runner de assertions ni se auditó PostgreSQL por SQL independiente.

## Cambios R4/A implementados

1. Agregada fuente **`PREPARATION_COSTS`** a `REPORT_SOURCES` y `DomainReportsStore`. Endpoint disponible: `GET /api/reports/analytics/sources/PREPARATION_COSTS?sucursalId=...&periodo=PERSONALIZADO&desde=...&hasta=...&page=1&limit=100`.
2. Permisos conjuntos **`reports.read` + `inventory.costs.read`**, filtrados por sucursal, y lectura en transacción `REPEATABLE READ`. No se añadieron permisos al seed, migraciones ni endpoints de escritura.
3. Documentos `ConsumoOrden` en orden cronológico, con `Orden`, `OrdenLinea`, `ComandaLinea`, `recetaVersionId`, `cantidadPreparada` y `ConsumoOrdenLinea`. Suma de **`MovimientoInventario.costoTotal` real con precisión de 6 decimales**, sin estimar usando precio comercial ni costo unitario multiplicado. Valida `movimientoId`, referencia tipo/ID, tipo `CONSUMO`, artículo, ubicación y lote; marca faltantes/inconsistentes `trazabilidadValida=false` y documento `costoRegistrado=null`.
4. Agregados globales por tipo `RECETA`, `DIRECTO` y `EMPAQUE`: número de documentos y líneas, líneas sin movimiento válido, **documentos sin líneas**, suma de costos de movimientos válidos. Agregados independientes de `page/limit`.
5. Se mantiene el costo de `EMPAQUE` a nivel de orden, separado del producto. **No es margen ni costo de venta atribuido**: la fecha es `ConsumoOrden.creadoEn` (fecha de preparación), frente a ventas por `Venta.cerradaEn`, y puede incluir orden en proceso o cancelación. No modificar `margenBruto=null` en overview hasta conciliar el origen completo.
6. Tests unitarios añadidos para movimiento Q1.542857, documentos incompletos, permisos insuficientes; test HTTP itera las nueve fuentes. Nueva colección Postman `docs/rep-a/Gastro_Core_REP_1_COSTS_R4_DEV.postman_collection.json`, una solicitud, verificando suma a seis decimales y vínculo de movimiento, pendiente de ejecutar en PostgreSQL DEV.
7. Documentación semántica: [REP_1_PREPARATION_COSTS_R4.md](../rep-a/REP_1_PREPARATION_COSTS_R4.md).

## CI y riesgos

- Un commit intermedio que modificaba solamente el enum de fuentes falló al compilar hasta agregar su permiso y store.
- Posteriormente, el primer commit de tests falló porque el fixture usaba `articulo` sin declarar. **Corregido** en commit `a95f2644cf02a914f9ad8b7b11a2575c0254fa96`. No interpretar CI intermedia fallida como resultado final; validar la última ejecución antes de aprobar.
- No se ha hecho prueba DEV de la fuente R4 ni se ha asignado consumo a `VentaLinea`. El sistema sigue sin calcular margen real.

## Próximos gates de cierre REP-A

- **R4/B**: asignar consumo RECETA/DIRECTO a las unidades de `VentaLinea` entre cuentas divididas, porciones de preparación y cancelaciones, sin duplicación. Informar costos no vendidos, packaging separado, cobertura y margen solo cuando completo.
- **R5**: pagos/proveedores, reembolsos, cobro externo, comisiones delivery, conciliación bancos, clientes. Diagnóstico de Q88 cobros/Q22 venta por estado.
- **R6**: consolidado multi-sucursal, seguridad RBAC por sucursal, paginación, consistencia temporal, índices/rendimiento.
- **REP-2**: XLSX real con registros originales y fórmulas, CSV, PDF, protección de inyección/PII, snapshot, QA de archivos y aceptación final.
- **DEV inmediato**: importar [Postman R4](../rep-a/Gastro_Core_REP_1_COSTS_R4_DEV.postman_collection.json), autenticar con `inventory.costs.read`, enviar JSON de resultados. Previo a merge, CI final, gate REP-1, gate REP-2 y aprobación explícita. PR #18 sigue DRAFT.

## Reanudación

Verificar HEAD branch, CI y primera respuesta DEV R4. No asumir éxito de CI ni cobertura completa sin evidencia. No merge y no tocar cobro/stock/ventas de escritura desde reportes.
