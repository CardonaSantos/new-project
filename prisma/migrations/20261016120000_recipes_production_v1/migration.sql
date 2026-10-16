-- REC-A: immutable recipes and idempotent production without modifying existing stock.
ALTER TABLE "RecetaVersion" ADD COLUMN "vidaUtilDias" INTEGER;
ALTER TABLE "ProduccionLote"
 ADD COLUMN "claveOperacion" TEXT,
 ADD COLUMN "solicitudHash" TEXT,
 ADD COLUMN "configuracion" JSONB,
 ADD COLUMN "movimientoResultadoId" TEXT;
CREATE UNIQUE INDEX "ProduccionLote_claveOperacion_key" ON "ProduccionLote"("claveOperacion");
CREATE UNIQUE INDEX "ProduccionLote_movimientoResultadoId_key" ON "ProduccionLote"("movimientoResultadoId");
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_movimientoResultadoId_fkey"
 FOREIGN KEY ("movimientoResultadoId") REFERENCES "MovimientoInventario"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecetaVersion" ADD CONSTRAINT "RecetaVersion_vidaUtilDias_check"
 CHECK ("vidaUtilDias" IS NULL OR "vidaUtilDias" BETWEEN 0 AND 3650);
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_tipo_target_check"
 CHECK (("tipo"='VENTA' AND "varianteId" IS NOT NULL AND "articuloResultadoId" IS NULL)
 OR ("tipo"='PRODUCCION' AND "articuloResultadoId" IS NOT NULL AND "varianteId" IS NULL));
CREATE UNIQUE INDEX "Receta_venta_variante_key" ON "Receta"("varianteId") WHERE "tipo"='VENTA';
CREATE UNIQUE INDEX "Receta_produccion_articulo_key" ON "Receta"("articuloResultadoId") WHERE "tipo"='PRODUCCION';
CREATE UNIQUE INDEX "RecetaVersion_active_one_key" ON "RecetaVersion"("recetaId") WHERE "activa"=true;
ALTER TABLE "RecetaComponente" ADD CONSTRAINT "RecetaComponente_cantidad_check"
 CHECK ("cantidad">0 AND "mermaPorcentaje">=0 AND "mermaPorcentaje"<100);
ALTER TABLE "RecetaVersion" ADD CONSTRAINT "RecetaVersion_rendimiento_check" CHECK ("rendimiento">0);
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_cantidad_check" CHECK ("cantidadProducida">0);
