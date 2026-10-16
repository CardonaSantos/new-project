-- ORD-A safety hardening: additive audit snapshot and explicit physical-modifier contract.
ALTER TABLE "Orden"
 ADD COLUMN "importeAnulado" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN "clasificacionCancelacion" VARCHAR(30),
 ADD COLUMN "motivoCancelacion" VARCHAR(500),
 ADD COLUMN "autorizadaCancelacionPreparada" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Orden"
 ADD CONSTRAINT "Orden_clasificacionCancelacion_valida"
 CHECK ("clasificacionCancelacion" IS NULL OR "clasificacionCancelacion" IN
  ('CORTESIA','MERMA_OPERATIVA','ERROR_OPERATIVO','OTRO'));
CREATE INDEX "Orden_sucursalId_clasificacionCancelacion_canceladaEn_idx"
 ON "Orden"("sucursalId","clasificacionCancelacion","canceladaEn");
ALTER TABLE "Modificador"
 ADD COLUMN "requiereComposicion" BOOLEAN NOT NULL DEFAULT FALSE;
