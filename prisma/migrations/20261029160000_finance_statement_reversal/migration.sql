CREATE TABLE "LineaExtractoBancario" (
 "id" TEXT NOT NULL,
 "cuentaFinancieraId" TEXT NOT NULL,
 "claveExterna" VARCHAR(160) NOT NULL,
 "fecha" DATE NOT NULL,
 "monto" DECIMAL(18,2) NOT NULL,
 "referencia" VARCHAR(160),
 "descripcion" VARCHAR(500),
 "movimientoFinancieroId" TEXT,
 "importadoPorId" TEXT NOT NULL,
 "conciliadoPorId" TEXT,
 "conciliadoEn" TIMESTAMPTZ(3),
 "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LineaExtractoBancario_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "LineaExtractoBancario_monto_check" CHECK ("monto" <> 0)
);
CREATE UNIQUE INDEX "LineaExtractoBancario_cuentaFinancieraId_claveExterna_key" ON "LineaExtractoBancario"("cuentaFinancieraId","claveExterna");
CREATE UNIQUE INDEX "LineaExtractoBancario_movimientoFinancieroId_key" ON "LineaExtractoBancario"("movimientoFinancieroId");
CREATE INDEX "LineaExtractoBancario_cuentaFinancieraId_fecha_idx" ON "LineaExtractoBancario"("cuentaFinancieraId","fecha");
ALTER TABLE "LineaExtractoBancario" ADD CONSTRAINT "LineaExtractoBancario_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineaExtractoBancario" ADD CONSTRAINT "LineaExtractoBancario_movimientoFinancieroId_fkey" FOREIGN KEY ("movimientoFinancieroId") REFERENCES "MovimientoFinanciero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineaExtractoBancario" ADD CONSTRAINT "LineaExtractoBancario_importadoPorId_fkey" FOREIGN KEY ("importadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineaExtractoBancario" ADD CONSTRAINT "LineaExtractoBancario_conciliadoPorId_fkey" FOREIGN KEY ("conciliadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ReversaFinanciera" (
 "id" TEXT NOT NULL,
 "sucursalId" TEXT NOT NULL,
 "movimientoOriginalId" TEXT NOT NULL,
 "movimientoReversaId" TEXT NOT NULL,
 "usuarioId" TEXT NOT NULL,
 "motivo" VARCHAR(500) NOT NULL,
 "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ReversaFinanciera_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReversaFinanciera_movimientoOriginalId_key" ON "ReversaFinanciera"("movimientoOriginalId");
CREATE UNIQUE INDEX "ReversaFinanciera_movimientoReversaId_key" ON "ReversaFinanciera"("movimientoReversaId");
CREATE INDEX "ReversaFinanciera_sucursalId_creadaEn_idx" ON "ReversaFinanciera"("sucursalId","creadaEn");
ALTER TABLE "ReversaFinanciera" ADD CONSTRAINT "ReversaFinanciera_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReversaFinanciera" ADD CONSTRAINT "ReversaFinanciera_movimientoOriginalId_fkey" FOREIGN KEY ("movimientoOriginalId") REFERENCES "MovimientoFinanciero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReversaFinanciera" ADD CONSTRAINT "ReversaFinanciera_movimientoReversaId_fkey" FOREIGN KEY ("movimientoReversaId") REFERENCES "MovimientoFinanciero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReversaFinanciera" ADD CONSTRAINT "ReversaFinanciera_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
