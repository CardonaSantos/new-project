-- PUR-A: preserve commercial vs fiscal value of supplier credit notes.
-- The columns are additive; existing notes are historical commercial credits
-- (their full amount belongs to the base, with no assumed tax adjustment).
ALTER TABLE "NotaCreditoProveedor"
 ADD COLUMN "subtotal" DECIMAL(18,2),
 ADD COLUMN "impuestos" DECIMAL(18,2) NOT NULL DEFAULT 0;
UPDATE "NotaCreditoProveedor" SET "subtotal" = "total" WHERE "subtotal" IS NULL;
ALTER TABLE "NotaCreditoProveedor" ALTER COLUMN "subtotal" SET NOT NULL;
ALTER TABLE "NotaCreditoProveedor"
 ADD CONSTRAINT "NotaCreditoProveedor_credit_tax_balance"
 CHECK ("subtotal" >= 0 AND "impuestos" >= 0 AND "total" = "subtotal" + "impuestos");
