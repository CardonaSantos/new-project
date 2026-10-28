-- SUP-A: link PUR-A purchase drafts to a supply requisition.
-- Older purchase orders remain unlinked; no historical data is modified.
ALTER TABLE "OrdenCompra" ADD COLUMN IF NOT EXISTS "requisicionId" TEXT;
DO $supa_fk$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
  WHERE conname = 'OrdenCompra_requisicionId_fkey' AND conrelid = '"OrdenCompra"'::regclass) THEN
  ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_requisicionId_fkey"
   FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id")
   ON DELETE SET NULL ON UPDATE CASCADE;
 END IF;
END $supa_fk$;
CREATE INDEX IF NOT EXISTS "OrdenCompra_requisicionId_estado_idx" ON "OrdenCompra"("requisicionId","estado");
