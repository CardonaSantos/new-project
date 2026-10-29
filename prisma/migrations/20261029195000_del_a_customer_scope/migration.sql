-- DEL-A D1. Aditiva: no cambia ni borra identidades, órdenes ni entregas históricas.
CREATE TABLE "ClienteSucursal" (
    "clienteId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClienteSucursal_pkey" PRIMARY KEY ("clienteId","sucursalId")
);
CREATE INDEX "ClienteSucursal_sucursalId_clienteId_idx" ON "ClienteSucursal"("sucursalId","clienteId");
ALTER TABLE "ClienteSucursal" ADD CONSTRAINT "ClienteSucursal_clienteId_fkey"
 FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClienteSucursal" ADD CONSTRAINT "ClienteSucursal_sucursalId_fkey"
 FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No se eliminan direcciones históricas enlazadas por Entrega.
ALTER TABLE "DireccionCliente" ADD COLUMN "activa" BOOLEAN NOT NULL DEFAULT true;

-- Preflight de datos: si hubo más de una principal activa para un cliente,
-- detener despliegue y resolver bajo supervisión; nunca elegir una arbitrariamente.
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM "DireccionCliente"
  WHERE "principal" = true AND "activa" = true
  GROUP BY "clienteId" HAVING COUNT(*) > 1
 ) THEN
  RAISE EXCEPTION 'DEL-A D1: existen clientes con múltiples direcciones principales; revisar antes de migrar';
 END IF;
END $$;
CREATE UNIQUE INDEX "DireccionCliente_clienteId_principal_activa_key"
 ON "DireccionCliente" ("clienteId") WHERE "principal" = true AND "activa" = true;

-- Customer history lookup is intentionally branch-scoped, not a table scan.
CREATE INDEX "Orden_clienteId_sucursalId_idx" ON "Orden"("clienteId","sucursalId");
CREATE INDEX "Venta_clienteId_sucursalId_idx" ON "Venta"("clienteId","sucursalId");
CREATE INDEX "Reserva_clienteId_sucursalId_idx" ON "Reserva"("clienteId","sucursalId");
