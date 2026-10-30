-- Assert safety-critical uniqueness without mutating DEV or CI data.
DO $$
DECLARE name TEXT;
BEGIN
 FOREACH name IN ARRAY ARRAY[
 'Venta_cuentaId_key','Entrega_ordenId_key',
 'LiquidacionRepartidorLinea_pagoId_key','MovimientoCaja_liquidacionRepartidorId_key'
 ] LOOP
  IF NOT EXISTS (
   SELECT 1 FROM pg_indexes
   WHERE schemaname=current_schema() AND indexname=name AND indexdef LIKE '%UNIQUE%'
  ) THEN
   RAISE EXCEPTION 'Missing unique accounting/logistics index: %',name;
  END IF;
 END LOOP;
END $$;
