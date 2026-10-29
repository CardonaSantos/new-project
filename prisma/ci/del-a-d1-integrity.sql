-- Run only against the ephemeral PostgreSQL CI service. Everything is rolled back.
BEGIN;
INSERT INTO "Sucursal"("id","codigo","nombre")
 VALUES ('del-a-ci-branch','DEL-A-CI','DEL-A migration smoke');
INSERT INTO "Cliente"("id","nombre") VALUES ('del-a-ci-client','Smoke client');
INSERT INTO "ClienteSucursal"("clienteId","sucursalId")
 VALUES ('del-a-ci-client','del-a-ci-branch');
INSERT INTO "DireccionCliente"("id","clienteId","direccion","principal")
 VALUES ('del-a-ci-address-1','del-a-ci-client','Primera dirección',true);
DO $$
DECLARE conflict_detected BOOLEAN := false;
BEGIN
 BEGIN
  INSERT INTO "DireccionCliente"("id","clienteId","direccion","principal")
  VALUES ('del-a-ci-address-2','del-a-ci-client','Segunda dirección',true);
 EXCEPTION WHEN unique_violation THEN
  conflict_detected := true;
 END;
 IF NOT conflict_detected THEN
  RAISE EXCEPTION 'DEL-A D1 integrity failed: second active principal accepted';
 END IF;
END $$;
INSERT INTO "DireccionCliente"("id","clienteId","direccion","principal","activa")
 VALUES ('del-a-ci-address-3','del-a-ci-client','Histórica inactiva',true,false);
ROLLBACK;
