CREATE UNIQUE INDEX IF NOT EXISTS "UsuarioRol_global_unique"
ON "UsuarioRol" ("usuarioId", "rolId")
WHERE "sucursalId" IS NULL;
