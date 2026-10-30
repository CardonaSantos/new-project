BEGIN;

-- Additive, no changes to existing delivery or accounting rows.
CREATE TABLE "EntregaEvento" (
    "id" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" VARCHAR(64) NOT NULL,
    "estadoAntes" "EstadoEntrega",
    "estadoDespues" "EstadoEntrega",
    "repartidorAntesId" TEXT,
    "repartidorDespuesId" TEXT,
    "motivo" VARCHAR(500),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntregaEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EntregaEvento_entregaId_creadoEn_idx" ON "EntregaEvento"("entregaId","creadoEn");

ALTER TABLE "EntregaEvento"
  ADD CONSTRAINT "EntregaEvento_entregaId_fkey"
  FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntregaEvento"
  ADD CONSTRAINT "EntregaEvento_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
