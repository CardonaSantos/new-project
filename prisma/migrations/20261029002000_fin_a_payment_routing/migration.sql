CREATE TABLE "RutaFinanciera" (
  "id" TEXT NOT NULL,
  "sucursalId" TEXT NOT NULL,
  "metodo" "MetodoPago" NOT NULL,
  "cuentaFinancieraId" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RutaFinanciera_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RutaFinanciera_sucursalId_metodo_key" ON "RutaFinanciera"("sucursalId","metodo");
CREATE INDEX "RutaFinanciera_cuentaFinancieraId_idx" ON "RutaFinanciera"("cuentaFinancieraId");
ALTER TABLE "RutaFinanciera" ADD CONSTRAINT "RutaFinanciera_sucursalId_fkey"
 FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RutaFinanciera" ADD CONSTRAINT "RutaFinanciera_cuentaFinancieraId_fkey"
 FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;