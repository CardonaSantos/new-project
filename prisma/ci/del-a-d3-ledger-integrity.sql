-- Ephemeral PostgreSQL CI only. All fixtures rolled back, no production changes.
BEGIN;
INSERT INTO "Sucursal"("id","codigo","nombre","actualizadoEn")
 VALUES ('d3-ci-branch','D3-TEST','D3 CI test',CURRENT_TIMESTAMP);
INSERT INTO "CanalExterno"("id","codigo","nombre")
 VALUES ('d3-ci-channel','D3-CI-CHANNEL','CI channel');
INSERT INTO "CuentaFinanciera"("id","sucursalId","nombre","tipo","moneda")
 VALUES ('d3-ci-bank','d3-ci-branch','Test bank','BANCO','GTQ');
INSERT INTO "LiquidacionCanalExterno"(
 "id","sucursalId","canalId","periodoInicio","periodoFin","referencia",
 "totalBruto","totalComision","totalNeto"
) VALUES (
 'd3-ci-settlement-1','d3-ci-branch','d3-ci-channel',CURRENT_DATE,CURRENT_DATE,
 'BANK-DEV-UNIQUE',22.00,2.00,20.00
);
DO $$
DECLARE blocked BOOLEAN := FALSE;
BEGIN
 BEGIN
  INSERT INTO "LiquidacionCanalExterno"(
   "id","sucursalId","canalId","periodoInicio","periodoFin","referencia",
   "totalBruto","totalComision","totalNeto"
  ) VALUES (
   'd3-ci-settlement-2','d3-ci-branch','d3-ci-channel',CURRENT_DATE,CURRENT_DATE,
   'BANK-DEV-UNIQUE',22.00,2.00,20.00
  );
 EXCEPTION WHEN unique_violation THEN blocked := TRUE;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'D3 platform bank reference uniqueness failed'; END IF;
END $$;
INSERT INTO "MovimientoFinanciero"("id","cuentaId","monto","referenciaTipo","referenciaId")
 VALUES ('d3-ci-movement-1','d3-ci-bank',20.00,'LIQUIDACION_CANAL','d3-ci-settlement-1');
DO $$
DECLARE blocked BOOLEAN := FALSE;
BEGIN
 BEGIN
  INSERT INTO "MovimientoFinanciero"("id","cuentaId","monto","referenciaTipo","referenciaId")
   VALUES ('d3-ci-movement-2','d3-ci-bank',20.00,'LIQUIDACION_CANAL','d3-ci-settlement-1');
 EXCEPTION WHEN unique_violation THEN blocked := TRUE;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'D3 platform ledger origin uniqueness failed'; END IF;
END $$;
ROLLBACK;
