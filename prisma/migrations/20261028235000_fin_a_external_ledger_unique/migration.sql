-- Each confirmed external payment, refund or supplier payment must post once,
-- regardless of retries, concurrent requests or which financial account is chosen.
CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoFinanciero_origen_externo_unico"
 ON "MovimientoFinanciero" ("referenciaTipo","referenciaId")
 WHERE "referenciaTipo" IN ('PAGO','REEMBOLSO_PAGO','PAGO_PROVEEDOR');
