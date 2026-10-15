-- CreateEnum
CREATE TYPE "AlcanceRol" AS ENUM ('GLOBAL', 'SUCURSAL');

-- AlterTable
ALTER TABLE "Rol" ADD COLUMN     "alcance" "AlcanceRol" NOT NULL DEFAULT 'SUCURSAL';

-- AlterTable
ALTER TABLE "SesionUsuario" ADD COLUMN     "ipCreacion" TEXT,
ADD COLUMN     "revocacionMotivo" TEXT,
ADD COLUMN     "ultimoUsoEn" TIMESTAMPTZ(3),
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "contrasenaCambiadaEn" TIMESTAMPTZ(3),
ADD COLUMN     "debeCambiarContrasena" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UsuarioRol" ALTER COLUMN "sucursalId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "IntentoAcceso" (
    "id" TEXT NOT NULL,
    "correoHash" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoAcceso_ip_creadoEn_idx" ON "IntentoAcceso"("ip", "creadoEn");

-- CreateIndex
CREATE INDEX "IntentoAcceso_correoHash_ip_creadoEn_idx" ON "IntentoAcceso"("correoHash", "ip", "creadoEn");
