-- Keep pre-existing DEV reconciliations explicitly unverified (NULL); never backfill a false approval.
ALTER TABLE "LineaExtractoBancario"
 ADD COLUMN "validacionReferencia" VARCHAR(40),
 ADD COLUMN "justificacionConciliacion" VARCHAR(500);
