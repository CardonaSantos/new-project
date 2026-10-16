-- PUR-A: additive extension, preserves previous purchasing documents.
ALTER TYPE "EstadoOrdenCompra" ADD VALUE IF NOT EXISTS 'CERRADA';
ALTER TYPE "TipoMovimientoInventario" ADD VALUE IF NOT EXISTS 'CONSUMO_INTERNO';
DO $pur_type$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoFacturaCompra') THEN
  CREATE TYPE "EstadoFacturaCompra" AS ENUM ('BORRADOR','CONFIRMADA','ANULADA');
 END IF;
END $pur_type$;
DO $pur_type$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoPagoProveedor') THEN
  CREATE TYPE "EstadoPagoProveedor" AS ENUM ('PENDIENTE','CONFIRMADO','RECHAZADO');
 END IF;
END $pur_type$;
DO $pur_type$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDevolucionProveedor') THEN
  CREATE TYPE "EstadoDevolucionProveedor" AS ENUM ('BORRADOR','CONFIRMADA','CANCELADA');
 END IF;
END $pur_type$;
DO $pur_type$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoNotaCreditoProveedor') THEN
  CREATE TYPE "EstadoNotaCreditoProveedor" AS ENUM ('BORRADOR','CONFIRMADA','CANCELADA');
 END IF;
END $pur_type$;
DO $pur_type$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoReintegroProveedor') THEN
  CREATE TYPE "EstadoReintegroProveedor" AS ENUM ('PENDIENTE','CONFIRMADO','RECHAZADO');
 END IF;
END $pur_type$;
ALTER TABLE "OrdenCompra" ADD COLUMN IF NOT EXISTS "cerradaEn" TIMESTAMPTZ(3), ADD COLUMN IF NOT EXISTS "motivoCierre" TEXT,
 ADD COLUMN IF NOT EXISTS "precioIncluyeImpuesto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecepcionCompraLinea" ADD COLUMN IF NOT EXISTS "movimientoId" TEXT,
 ADD COLUMN IF NOT EXISTS "cantidadRechazada" DECIMAL(20,6) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "RecepcionCompraLinea_movimientoId_key" ON "RecepcionCompraLinea"("movimientoId");
ALTER TABLE "FacturaProveedor" ADD COLUMN IF NOT EXISTS "estado" "EstadoFacturaCompra" NOT NULL DEFAULT 'BORRADOR',
 ADD COLUMN IF NOT EXISTS "precioIncluyeImpuesto" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "confirmadaEn" TIMESTAMPTZ(3), ADD COLUMN IF NOT EXISTS "anuladaEn" TIMESTAMPTZ(3),
 ADD COLUMN IF NOT EXISTS "motivoAnulacion" TEXT;
-- Existing historical invoices were entered before this workflow; keep them as confirmed obligations.
UPDATE "FacturaProveedor" SET "estado"='CONFIRMADA', "confirmadaEn"="creadaEn";
ALTER TABLE "FacturaProveedorLinea" ADD COLUMN IF NOT EXISTS "tasaImpuesto" DECIMAL(8,6) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS "importeImpuesto" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PagoProveedor" ADD COLUMN IF NOT EXISTS "estado" "EstadoPagoProveedor" NOT NULL DEFAULT 'PENDIENTE',
 ADD COLUMN IF NOT EXISTS "confirmadoEn" TIMESTAMPTZ(3), ADD COLUMN IF NOT EXISTS "verificadoPorId" TEXT,
 ADD COLUMN IF NOT EXISTS "motivoRechazo" TEXT, ADD COLUMN IF NOT EXISTS "sucursalId" TEXT;
UPDATE "PagoProveedor" SET "estado"='CONFIRMADO', "confirmadoEn"="pagadoEn" WHERE "estado"='PENDIENTE';
ALTER TABLE "AplicacionPagoProveedor" ADD COLUMN IF NOT EXISTS "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE IF NOT EXISTS "DevolucionProveedor" (
 "id" TEXT PRIMARY KEY, "proveedorId" TEXT NOT NULL REFERENCES "Proveedor"("id") ON DELETE RESTRICT,
 "sucursalId" TEXT NOT NULL REFERENCES "Sucursal"("id") ON DELETE RESTRICT,
 "almacenId" TEXT NOT NULL REFERENCES "Almacen"("id") ON DELETE RESTRICT,
 "estado" "EstadoDevolucionProveedor" NOT NULL DEFAULT 'BORRADOR',
 "motivo" TEXT NOT NULL,"usuarioId" TEXT NOT NULL,
 "confirmadoEn" TIMESTAMPTZ(3),"creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "DevolucionProveedor_sucursalId_estado_creadoEn_idx" ON "DevolucionProveedor"("sucursalId","estado","creadoEn");
CREATE TABLE IF NOT EXISTS "DevolucionProveedorLinea"(
 "id" TEXT PRIMARY KEY,"devolucionId" TEXT NOT NULL REFERENCES "DevolucionProveedor"("id") ON DELETE RESTRICT,
 "recepcionLineaId" TEXT NOT NULL REFERENCES "RecepcionCompraLinea"("id") ON DELETE RESTRICT,
 "articuloId" TEXT NOT NULL,"ubicacionId" TEXT NOT NULL,"loteId" TEXT,
 "cantidadBase" DECIMAL(20,6) NOT NULL,"costoContable" DECIMAL(18,6),"movimientoId" TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS "DevolucionProveedorLinea_recepcionLineaId_idx" ON "DevolucionProveedorLinea"("recepcionLineaId");
CREATE TABLE IF NOT EXISTS "NotaCreditoProveedor"(
 "id" TEXT PRIMARY KEY,"proveedorId" TEXT NOT NULL REFERENCES "Proveedor"("id") ON DELETE RESTRICT,
 "sucursalId" TEXT NOT NULL REFERENCES "Sucursal"("id") ON DELETE RESTRICT,
 "numeroDocumento" TEXT NOT NULL,"motivo" TEXT NOT NULL,"total" DECIMAL(18,2) NOT NULL,
 "estado" "EstadoNotaCreditoProveedor" NOT NULL DEFAULT 'BORRADOR',
 "devolucionId" TEXT,"creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "confirmadaEn" TIMESTAMPTZ(3),CONSTRAINT "NotaCreditoProveedor_proveedorId_numeroDocumento_key" UNIQUE("proveedorId","numeroDocumento"));
CREATE INDEX IF NOT EXISTS "NotaCreditoProveedor_sucursalId_estado_idx" ON "NotaCreditoProveedor"("sucursalId","estado");
CREATE TABLE IF NOT EXISTS "AplicacionNotaCreditoProveedor"(
 "id" TEXT PRIMARY KEY,"notaId" TEXT NOT NULL REFERENCES "NotaCreditoProveedor"("id") ON DELETE RESTRICT,
 "facturaId" TEXT NOT NULL REFERENCES "FacturaProveedor"("id") ON DELETE RESTRICT,
 "monto" DECIMAL(18,2) NOT NULL,"creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AplicacionNotaCreditoProveedor_notaId_facturaId_key" UNIQUE("notaId","facturaId"));
CREATE TABLE IF NOT EXISTS "ReintegroProveedor"(
 "id" TEXT PRIMARY KEY,"notaId" TEXT NOT NULL REFERENCES "NotaCreditoProveedor"("id") ON DELETE RESTRICT,
 "metodo" "MetodoPago" NOT NULL,"monto" DECIMAL(18,2) NOT NULL,"referencia" TEXT,
 "turnoCajaId" TEXT,"estado" "EstadoReintegroProveedor" NOT NULL DEFAULT 'PENDIENTE',
 "confirmadoEn" TIMESTAMPTZ(3),"usuarioId" TEXT NOT NULL,
 "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"movimientoCajaId" TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS "ConsumoInterno"(
 "id" TEXT PRIMARY KEY, "articuloId" TEXT NOT NULL,"ubicacionId" TEXT NOT NULL,
 "loteId" TEXT,"cantidad" DECIMAL(20,6) NOT NULL,"destinoUso" TEXT NOT NULL,
 "motivo" TEXT NOT NULL,"responsableId" TEXT NOT NULL,"movimientoId" TEXT NOT NULL UNIQUE,
 "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ConsumoInterno_ubicacionId_creadoEn_idx" ON "ConsumoInterno"("ubicacionId","creadoEn");
CREATE INDEX IF NOT EXISTS "PagoProveedor_sucursalId_estado_idx" ON "PagoProveedor"("sucursalId","estado");
CREATE INDEX IF NOT EXISTS "FacturaProveedor_sucursalId_estado_idx" ON "FacturaProveedor"("sucursalId","estado");
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecepcionCompraLinea_rechazada_nonnegative' AND conrelid = '"RecepcionCompraLinea"'::regclass) THEN
  ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_rechazada_nonnegative" CHECK ("cantidadRechazada">=0);
 END IF;
END $pur_check$;
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DevolucionProveedorLinea_qty_positive' AND conrelid = '"DevolucionProveedorLinea"'::regclass) THEN
  ALTER TABLE "DevolucionProveedorLinea" ADD CONSTRAINT "DevolucionProveedorLinea_qty_positive" CHECK ("cantidadBase">0);
 END IF;
END $pur_check$;
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotaCreditoProveedor_total_positive' AND conrelid = '"NotaCreditoProveedor"'::regclass) THEN
  ALTER TABLE "NotaCreditoProveedor" ADD CONSTRAINT "NotaCreditoProveedor_total_positive" CHECK ("total">0);
 END IF;
END $pur_check$;
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AplicacionNotaCreditoProveedor_positive' AND conrelid = '"AplicacionNotaCreditoProveedor"'::regclass) THEN
  ALTER TABLE "AplicacionNotaCreditoProveedor" ADD CONSTRAINT "AplicacionNotaCreditoProveedor_positive" CHECK ("monto">0);
 END IF;
END $pur_check$;
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsumoInterno_qty_positive' AND conrelid = '"ConsumoInterno"'::regclass) THEN
  ALTER TABLE "ConsumoInterno" ADD CONSTRAINT "ConsumoInterno_qty_positive" CHECK ("cantidad">0);
 END IF;
END $pur_check$;

-- Snapshots of supplier tax treatment. Commercial amount and capitalized stock cost
-- must not be conflated when the documented tax is recoverable.
ALTER TABLE "OrdenCompraLinea"
 ADD COLUMN IF NOT EXISTS "tasaImpuesto" DECIMAL(8,6) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS "impuestoEstimado" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS "impuestoRecuperable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecepcionCompraLinea"
 ADD COLUMN IF NOT EXISTS "tasaImpuesto" DECIMAL(8,6) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS "importeImpuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS "importeComercial" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS "precioIncluyeImpuesto" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "impuestoRecuperable" BOOLEAN NOT NULL DEFAULT false;
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrdenCompraLinea_tasa_0_1' AND conrelid = '"OrdenCompraLinea"'::regclass) THEN
  ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_tasa_0_1" CHECK ("tasaImpuesto" >= 0 AND "tasaImpuesto" <= 1);
 END IF;
END $pur_check$;
DO $pur_check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecepcionCompraLinea_tasa_0_1' AND conrelid = '"RecepcionCompraLinea"'::regclass) THEN
  ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_tasa_0_1" CHECK ("tasaImpuesto" >= 0 AND "tasaImpuesto" <= 1);
 END IF;
END $pur_check$;
