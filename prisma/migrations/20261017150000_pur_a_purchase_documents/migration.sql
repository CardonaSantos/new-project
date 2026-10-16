-- PUR-A: additive extension, preserves previous purchasing documents.
ALTER TYPE "EstadoOrdenCompra" ADD VALUE IF NOT EXISTS 'CERRADA';
ALTER TYPE "TipoMovimientoInventario" ADD VALUE IF NOT EXISTS 'CONSUMO_INTERNO';
CREATE TYPE "EstadoFacturaCompra" AS ENUM ('BORRADOR','CONFIRMADA','ANULADA');
CREATE TYPE "EstadoPagoProveedor" AS ENUM ('PENDIENTE','CONFIRMADO','RECHAZADO');
CREATE TYPE "EstadoDevolucionProveedor" AS ENUM ('BORRADOR','CONFIRMADA','CANCELADA');
CREATE TYPE "EstadoNotaCreditoProveedor" AS ENUM ('BORRADOR','CONFIRMADA','CANCELADA');
CREATE TYPE "EstadoReintegroProveedor" AS ENUM ('PENDIENTE','CONFIRMADO','RECHAZADO');
ALTER TABLE "OrdenCompra" ADD COLUMN "cerradaEn" TIMESTAMPTZ(3), ADD COLUMN "motivoCierre" TEXT,
 ADD COLUMN "precioIncluyeImpuesto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecepcionCompraLinea" ADD COLUMN "movimientoId" TEXT,
 ADD COLUMN "cantidadRechazada" DECIMAL(20,6) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "RecepcionCompraLinea_movimientoId_key" ON "RecepcionCompraLinea"("movimientoId");
ALTER TABLE "FacturaProveedor" ADD COLUMN "estado" "EstadoFacturaCompra" NOT NULL DEFAULT 'BORRADOR',
 ADD COLUMN "precioIncluyeImpuesto" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "confirmadaEn" TIMESTAMPTZ(3), ADD COLUMN "anuladaEn" TIMESTAMPTZ(3),
 ADD COLUMN "motivoAnulacion" TEXT;
-- Existing historical invoices were entered before this workflow; keep them as confirmed obligations.
UPDATE "FacturaProveedor" SET "estado"='CONFIRMADA', "confirmadaEn"="creadaEn";
ALTER TABLE "FacturaProveedorLinea" ADD COLUMN "tasaImpuesto" DECIMAL(8,6) NOT NULL DEFAULT 0,
 ADD COLUMN "importeImpuesto" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PagoProveedor" ADD COLUMN "estado" "EstadoPagoProveedor" NOT NULL DEFAULT 'PENDIENTE',
 ADD COLUMN "confirmadoEn" TIMESTAMPTZ(3), ADD COLUMN "verificadoPorId" TEXT,
 ADD COLUMN "motivoRechazo" TEXT, ADD COLUMN "sucursalId" TEXT;
UPDATE "PagoProveedor" SET "estado"='CONFIRMADO', "confirmadoEn"="pagadoEn" WHERE "estado"='PENDIENTE';
ALTER TABLE "AplicacionPagoProveedor" ADD COLUMN "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "DevolucionProveedor" (
 "id" TEXT PRIMARY KEY, "proveedorId" TEXT NOT NULL REFERENCES "Proveedor"("id") ON DELETE RESTRICT,
 "sucursalId" TEXT NOT NULL REFERENCES "Sucursal"("id") ON DELETE RESTRICT,
 "almacenId" TEXT NOT NULL REFERENCES "Almacen"("id") ON DELETE RESTRICT,
 "estado" "EstadoDevolucionProveedor" NOT NULL DEFAULT 'BORRADOR',
 "motivo" TEXT NOT NULL,"usuarioId" TEXT NOT NULL,
 "confirmadoEn" TIMESTAMPTZ(3),"creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "DevolucionProveedor_sucursalId_estado_creadoEn_idx" ON "DevolucionProveedor"("sucursalId","estado","creadoEn");
CREATE TABLE "DevolucionProveedorLinea"(
 "id" TEXT PRIMARY KEY,"devolucionId" TEXT NOT NULL REFERENCES "DevolucionProveedor"("id") ON DELETE RESTRICT,
 "recepcionLineaId" TEXT NOT NULL REFERENCES "RecepcionCompraLinea"("id") ON DELETE RESTRICT,
 "articuloId" TEXT NOT NULL,"ubicacionId" TEXT NOT NULL,"loteId" TEXT,
 "cantidadBase" DECIMAL(20,6) NOT NULL,"costoContable" DECIMAL(18,6),"movimientoId" TEXT UNIQUE);
CREATE INDEX "DevolucionProveedorLinea_recepcionLineaId_idx" ON "DevolucionProveedorLinea"("recepcionLineaId");
CREATE TABLE "NotaCreditoProveedor"(
 "id" TEXT PRIMARY KEY,"proveedorId" TEXT NOT NULL REFERENCES "Proveedor"("id") ON DELETE RESTRICT,
 "sucursalId" TEXT NOT NULL REFERENCES "Sucursal"("id") ON DELETE RESTRICT,
 "numeroDocumento" TEXT NOT NULL,"motivo" TEXT NOT NULL,"total" DECIMAL(18,2) NOT NULL,
 "estado" "EstadoNotaCreditoProveedor" NOT NULL DEFAULT 'BORRADOR',
 "devolucionId" TEXT,"creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "confirmadaEn" TIMESTAMPTZ(3),CONSTRAINT "NotaCreditoProveedor_proveedorId_numeroDocumento_key" UNIQUE("proveedorId","numeroDocumento"));
CREATE INDEX "NotaCreditoProveedor_sucursalId_estado_idx" ON "NotaCreditoProveedor"("sucursalId","estado");
CREATE TABLE "AplicacionNotaCreditoProveedor"(
 "id" TEXT PRIMARY KEY,"notaId" TEXT NOT NULL REFERENCES "NotaCreditoProveedor"("id") ON DELETE RESTRICT,
 "facturaId" TEXT NOT NULL REFERENCES "FacturaProveedor"("id") ON DELETE RESTRICT,
 "monto" DECIMAL(18,2) NOT NULL,"creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AplicacionNotaCreditoProveedor_notaId_facturaId_key" UNIQUE("notaId","facturaId"));
CREATE TABLE "ReintegroProveedor"(
 "id" TEXT PRIMARY KEY,"notaId" TEXT NOT NULL REFERENCES "NotaCreditoProveedor"("id") ON DELETE RESTRICT,
 "metodo" "MetodoPago" NOT NULL,"monto" DECIMAL(18,2) NOT NULL,"referencia" TEXT,
 "turnoCajaId" TEXT,"estado" "EstadoReintegroProveedor" NOT NULL DEFAULT 'PENDIENTE',
 "confirmadoEn" TIMESTAMPTZ(3),"usuarioId" TEXT NOT NULL,
 "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"movimientoCajaId" TEXT UNIQUE);
CREATE TABLE "ConsumoInterno"(
 "id" TEXT PRIMARY KEY, "articuloId" TEXT NOT NULL,"ubicacionId" TEXT NOT NULL,
 "loteId" TEXT,"cantidad" DECIMAL(20,6) NOT NULL,"destinoUso" TEXT NOT NULL,
 "motivo" TEXT NOT NULL,"responsableId" TEXT NOT NULL,"movimientoId" TEXT NOT NULL UNIQUE,
 "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ConsumoInterno_ubicacionId_creadoEn_idx" ON "ConsumoInterno"("ubicacionId","creadoEn");
CREATE INDEX "PagoProveedor_sucursalId_estado_idx" ON "PagoProveedor"("sucursalId","estado");
CREATE INDEX "FacturaProveedor_sucursalId_estado_idx" ON "FacturaProveedor"("sucursalId","estado");
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_rechazada_nonnegative" CHECK ("cantidadRechazada">=0);
ALTER TABLE "DevolucionProveedorLinea" ADD CONSTRAINT "DevolucionProveedorLinea_qty_positive" CHECK("cantidadBase">0);
ALTER TABLE "NotaCreditoProveedor" ADD CONSTRAINT "NotaCreditoProveedor_total_positive" CHECK("total">0);
ALTER TABLE "AplicacionNotaCreditoProveedor" ADD CONSTRAINT "AplicacionNotaCreditoProveedor_positive" CHECK("monto">0);
ALTER TABLE "ConsumoInterno" ADD CONSTRAINT "ConsumoInterno_qty_positive" CHECK("cantidad">0);
\n-- Snapshots of supplier tax treatment. Commercial amount and capitalized stock cost
-- must not be conflated when the documented tax is recoverable.
ALTER TABLE "OrdenCompraLinea"
 ADD COLUMN "tasaImpuesto" DECIMAL(8,6) NOT NULL DEFAULT 0,
 ADD COLUMN "impuestoEstimado" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN "impuestoRecuperable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecepcionCompraLinea"
 ADD COLUMN "tasaImpuesto" DECIMAL(8,6) NOT NULL DEFAULT 0,
 ADD COLUMN "importeImpuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN "importeComercial" DECIMAL(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN "precioIncluyeImpuesto" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "impuestoRecuperable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_tasa_0_1"
 CHECK ("tasaImpuesto" >= 0 AND "tasaImpuesto" <= 1);
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_tasa_0_1"
 CHECK ("tasaImpuesto" >= 0 AND "tasaImpuesto" <= 1);
