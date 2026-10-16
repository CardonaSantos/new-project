-- ORD-A - Additive tables/line snapshots and exactly-once consumption.
-- Avoid destructive edits of historic orders.
ALTER TYPE "TipoConsumoOrden" ADD VALUE IF NOT EXISTS 'DIRECTO';
ALTER TABLE "Orden"
 ADD COLUMN "claveOperacion" TEXT,
 ADD COLUMN "solicitudHash" TEXT;
CREATE UNIQUE INDEX "Orden_claveOperacion_key" ON "Orden"("claveOperacion");
ALTER TABLE "OrdenLinea"
 ADD COLUMN "recetaVersionId" TEXT,
 ADD COLUMN "composicionSnapshot" JSONB,
 ADD COLUMN "cantidadEnviada" DECIMAL(18,3) NOT NULL DEFAULT 0;
ALTER TABLE "OrdenLinea" ADD CONSTRAINT "OrdenLinea_recetaVersionId_fkey"
 FOREIGN KEY ("recetaVersionId") REFERENCES "RecetaVersion"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComandaLinea"
 ADD COLUMN "cantidadPreparada" DECIMAL(18,3) NOT NULL DEFAULT 0;
ALTER TABLE "ConsumoOrden"
 ADD COLUMN "ordenLineaId" TEXT,
 ADD COLUMN "claveOperacion" TEXT,
 ADD COLUMN "solicitudHash" TEXT;
ALTER TABLE "ConsumoOrden" ADD CONSTRAINT "ConsumoOrden_ordenLineaId_fkey"
 FOREIGN KEY ("ordenLineaId") REFERENCES "OrdenLinea"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ConsumoOrden_claveOperacion_key" ON "ConsumoOrden"("claveOperacion");
CREATE INDEX "ConsumoOrden_ordenLineaId_idx" ON "ConsumoOrden"("ordenLineaId");
CREATE UNIQUE INDEX "OcupacionMesa_una_abierta_key" ON "OcupacionMesa"("mesaId")
 WHERE "cerradaEn" IS NULL;
ALTER TABLE "OrdenLinea" ADD CONSTRAINT "OrdenLinea_enviada_no_negativa"
 CHECK ("cantidad">0 AND "cantidadEnviada">=0 AND "cantidadEnviada"<="cantidad");
ALTER TABLE "ComandaLinea" ADD CONSTRAINT "ComandaLinea_preparada_no_negativa"
 CHECK ("cantidad">0 AND "cantidadPreparada">=0 AND "cantidadPreparada"<="cantidad");

-- Efficient incremental updates to authenticated kitchen screens.
CREATE INDEX "EventoOutbox_kitchen_branch_cursor_idx"
 ON "EventoOutbox" ((payload->>'sucursalId'), "creadoEn", "id")
 WHERE "tipo" IN ('KITCHEN_TICKET_CREATED','KITCHEN_TICKET_UPDATED');
