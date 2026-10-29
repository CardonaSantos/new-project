BEGIN;

-- Backfill unambiguous existing platform settlements only; no data removal.
ALTER TABLE "LiquidacionCanalExterno" ADD COLUMN "sucursalId" TEXT;
UPDATE "LiquidacionCanalExterno" AS l
SET "sucursalId" = grouped."sucursalId"
FROM (
 SELECT line."liquidacionId", MIN(o."sucursalId") AS "sucursalId"
 FROM "LiquidacionCanalExternoLinea" AS line
 JOIN "Entrega" AS e ON e."id" = line."entregaId"
 JOIN "Orden" AS o ON o."id" = e."ordenId"
 GROUP BY line."liquidacionId"
 HAVING COUNT(DISTINCT o."sucursalId") = 1
) AS grouped
WHERE grouped."liquidacionId" = l."id";

CREATE INDEX "LiquidacionCanalExterno_sucursalId_periodoInicio_idx"
 ON "LiquidacionCanalExterno"("sucursalId","periodoInicio");
ALTER TABLE "LiquidacionCanalExterno"
 ADD CONSTRAINT "LiquidacionCanalExterno_sucursalId_fkey"
 FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MovimientoFinanciero_liquidacionCanal_unico_idx"
 ON "MovimientoFinanciero"("referenciaTipo","referenciaId")
 WHERE "referenciaTipo" = 'LIQUIDACION_CANAL';

COMMIT;
