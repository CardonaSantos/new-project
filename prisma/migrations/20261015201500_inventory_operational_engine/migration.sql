-- INV-B: balances, transfer accounting, and physical-count adjustments.
-- Requires PostgreSQL 15+. Review pre-existing duplicates and negative balances BEFORE deploying.
CREATE UNIQUE INDEX "Existencia_no_lot_unique"
 ON "Existencia" ("articuloId","ubicacionId") WHERE "loteId" IS NULL;
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_nonnegative" CHECK ("cantidad" >= 0 AND "costoPromedio" >= 0);
ALTER TABLE "CapaCostoInventario" ADD CONSTRAINT "CapaCostoInventario_nonnegative"
 CHECK ("cantidadInicial" > 0 AND "cantidadRestante" >= 0 AND "cantidadRestante" <= "cantidadInicial" AND "costoUnitario" >= 0);
ALTER TABLE "AplicacionCapaCosto" ADD CONSTRAINT "AplicacionCapaCosto_positive"
 CHECK ("cantidad" > 0 AND "costoUnitario" >= 0);
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_nonzero"
 CHECK ("cantidad" <> 0 AND "costoUnitario" >= 0 AND "costoTotal" >= 0);
ALTER TABLE "TransferenciaInventarioLinea"
 ADD COLUMN "costoEnTransito" DECIMAL(20,6),
 ADD COLUMN "capasEnTransito" JSONB;
ALTER TABLE "ConteoInventarioLinea"
 ADD COLUMN "costoUnitarioEntrada" DECIMAL(18,6);
CREATE INDEX "MovimientoInventario_stock_kardex"
 ON "MovimientoInventario" ("articuloId","ubicacionId","loteId","creadoEn");
CREATE INDEX "TransferenciaInventario_transit_status"
 ON "TransferenciaInventario" ("estado","almacenOrigenId","almacenDestinoId");
