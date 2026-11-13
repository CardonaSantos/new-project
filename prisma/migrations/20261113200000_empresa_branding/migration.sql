BEGIN;

-- Branding: a single primary brand color (hex, e.g. "#1A73E8") and an
-- optional logo, stored as a one-to-one link to an existing Media upload
-- (same pattern as PerfilUsuario.avatarMediaId). Both nullable: existing
-- companies keep their current (default) look until someone sets these.
ALTER TABLE "EmpresaConfiguracion" ADD COLUMN "colorPrimario" VARCHAR(7);
ALTER TABLE "EmpresaConfiguracion" ADD COLUMN "logoMediaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaConfiguracion_logoMediaId_key" ON "EmpresaConfiguracion"("logoMediaId");

-- AddForeignKey
ALTER TABLE "EmpresaConfiguracion" ADD CONSTRAINT "EmpresaConfiguracion_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
