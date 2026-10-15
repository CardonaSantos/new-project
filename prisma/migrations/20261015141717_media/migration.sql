-- AlterEnum
ALTER TYPE "TipoMedia" ADD VALUE 'DOCUMENTO';

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "contexto" VARCHAR(32) NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "publico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sucursalId" TEXT;

-- CreateIndex
CREATE INDEX "Media_sucursalId_contexto_creadoEn_idx" ON "Media"("sucursalId", "contexto", "creadoEn");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
