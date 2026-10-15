-- INV-A: invariantes del catálogo de unidades y artículos.
-- Revisar registros existentes; fallará si hay unidades base duplicadas o datos inválidos.
CREATE UNIQUE INDEX "UnidadMedida_base_dimension_unique"
 ON "UnidadMedida" ("dimension") WHERE "esBase" = TRUE;
ALTER TABLE "ConversionUnidad" ADD CONSTRAINT "ConversionUnidad_factor_positive"
 CHECK ("factor" > 0 AND "unidadOrigenId" <> "unidadDestinoId");
ALTER TABLE "ArticuloInventario" ADD CONSTRAINT "ArticuloInventario_lot_expiration"
 CHECK (NOT "requiereVencimiento" OR "requiereLote");
ALTER TABLE "ArticuloInventario" ADD CONSTRAINT "ArticuloInventario_nonnegative"
 CHECK (("costoReferencia" IS NULL OR "costoReferencia" >= 0)
    AND ("stockMinimo" IS NULL OR "stockMinimo" >= 0));
CREATE UNIQUE INDEX "UbicacionAlmacen_one_active_reception"
 ON "UbicacionAlmacen" ("almacenId") WHERE "esRecepcion" = TRUE AND "activa" = TRUE;
