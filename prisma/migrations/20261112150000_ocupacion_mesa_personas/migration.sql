BEGIN;

-- Optional headcount for a table occupation. Nullable: existing rows and the
-- auto check-in flow (which doesn't collect a party size) simply leave it unset.
ALTER TABLE "OcupacionMesa" ADD COLUMN "personas" INTEGER;

COMMIT;
