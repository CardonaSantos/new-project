BEGIN;

-- Full per-mode color theme, hand-edited by each business. A single hex
-- column can't hold it: the palette is 19 tokens for light plus 19 for dark.
-- Nullable, so a business without one keeps falling back to colorPrimario
-- and then to the built-in preset.
ALTER TABLE "EmpresaConfiguracion" ADD COLUMN "tema" JSONB;

COMMIT;
