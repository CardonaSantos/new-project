
-- PAY-A: one active shift per register/cashier, cash/financial amounts positive.
-- Abort the migration on preexisting violations; never delete financial records.
CREATE UNIQUE INDEX "TurnoCaja_caja_abierta_unique"
 ON "TurnoCaja" ("cajaId") WHERE "cerradaEn" IS NULL;
CREATE UNIQUE INDEX "TurnoCaja_cajero_abierto_unique"
 ON "TurnoCaja" ("cajeroId") WHERE "cerradaEn" IS NULL;
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_fondoInicial_nonnegative"
 CHECK ("fondoInicial" >= 0);
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_monto_positive"
 CHECK ("monto" > 0);
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_monto_positive" CHECK ("monto" > 0);
ALTER TABLE "IntentoPago" ADD CONSTRAINT "IntentoPago_monto_positive" CHECK ("monto" > 0);
ALTER TABLE "ReembolsoPago" ADD CONSTRAINT "ReembolsoPago_monto_positive" CHECK ("monto" > 0);
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_cobro_bounds"
 CHECK ("pagado" >= 0 AND "pagado" <= "total");
ALTER TABLE "Pago"
 ADD COLUMN "efectivoRecibido" DECIMAL(18,2),
 ADD COLUMN "vuelto" DECIMAL(18,2);
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_efectivoRecibido_gte_monto"
 CHECK ("efectivoRecibido" IS NULL OR ("efectivoRecibido" >= "monto" AND "vuelto" = "efectivoRecibido" - "monto"));
