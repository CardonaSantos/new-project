-- An operating expense from an external account may only debit that account once.
-- Other future financial source types retain independent cardinality.
CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoFinanciero_gasto_ref_unique"
 ON "MovimientoFinanciero" ("referenciaTipo","referenciaId")
 WHERE "referenciaTipo" = 'GASTO_OPERATIVO';
