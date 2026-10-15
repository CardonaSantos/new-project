-- CAT-A. Los precios existentes deben carecer de vigencias superpuestas.
-- btree_gist permite rangos temporales por IDs de texto.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "PrecioVariante" ADD CONSTRAINT "PrecioVariante_positive_period"
 CHECK ("importe" >= 0 AND ("vigenteHasta" IS NULL OR "vigenteHasta" > "vigenteDesde"));
ALTER TABLE "PrecioVariante" ADD CONSTRAINT "PrecioVariante_no_overlap"
 EXCLUDE USING gist ("varianteId" WITH =, "sucursalId" WITH =,
 tstzrange("vigenteDesde", "vigenteHasta", '[)') WITH &&);
ALTER TABLE "GrupoModificador" ADD CONSTRAINT "GrupoModificador_bounds"
 CHECK ("minimo" >= 0 AND ("maximo" IS NULL OR "maximo" >= "minimo"));
ALTER TABLE "VarianteGrupoModificador" ADD CONSTRAINT "VarianteGrupoModificador_order"
 CHECK ("orden" >= 0);
CREATE TABLE "Menu" (
  "id" TEXT NOT NULL PRIMARY KEY, "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL,
  "descripcion" TEXT, "activo" BOOLEAN NOT NULL DEFAULT TRUE,
  "publicadoEn" TIMESTAMPTZ(3), "version" INTEGER NOT NULL DEFAULT 1,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "Menu_codigo_key" ON "Menu"("codigo");
CREATE TABLE "MenuSucursal" (
  "menuId" TEXT NOT NULL, "sucursalId" TEXT NOT NULL, "activa" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "MenuSucursal_pkey" PRIMARY KEY("menuId","sucursalId"),
  CONSTRAINT "MenuSucursal_menuId_fkey" FOREIGN KEY("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MenuSucursal_sucursalId_fkey" FOREIGN KEY("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MenuSucursal_sucursalId_activa_idx" ON "MenuSucursal"("sucursalId","activa");
CREATE TABLE "MenuSeccion" (
  "id" TEXT NOT NULL PRIMARY KEY, "menuId" TEXT NOT NULL, "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0, "activa" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "MenuSeccion_menuId_fkey" FOREIGN KEY("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MenuSeccion_menuId_nombre_key" ON "MenuSeccion"("menuId","nombre");
CREATE INDEX "MenuSeccion_menuId_orden_idx" ON "MenuSeccion"("menuId","orden");
CREATE TABLE "MenuItem" (
  "id" TEXT NOT NULL PRIMARY KEY, "seccionId" TEXT NOT NULL,"varianteId" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,"activo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "MenuItem_seccionId_fkey" FOREIGN KEY("seccionId") REFERENCES "MenuSeccion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MenuItem_varianteId_fkey" FOREIGN KEY("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MenuItem_seccionId_varianteId_key" ON "MenuItem"("seccionId","varianteId");
CREATE INDEX "MenuItem_varianteId_idx" ON "MenuItem"("varianteId");
CREATE TABLE "MenuHorario" (
  "id" TEXT NOT NULL PRIMARY KEY,"menuId" TEXT NOT NULL,
  "diaSemana" INTEGER NOT NULL,"desde" VARCHAR(5) NOT NULL,"hasta" VARCHAR(5) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "MenuHorario_menuId_fkey" FOREIGN KEY("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MenuHorario_valid" CHECK ("diaSemana" BETWEEN 0 AND 6 AND "desde" ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' AND "hasta" ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' AND "desde" < "hasta")
);
CREATE INDEX "MenuHorario_menuId_diaSemana_activo_idx" ON "MenuHorario"("menuId","diaSemana","activo");
CREATE TABLE "VarianteSucursal" (
  "varianteId" TEXT NOT NULL,"sucursalId" TEXT NOT NULL,
  "habilitada" BOOLEAN NOT NULL DEFAULT TRUE, "pausadaHasta" TIMESTAMPTZ(3),
  "motivo" TEXT,"actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VarianteSucursal_pkey" PRIMARY KEY("varianteId","sucursalId"),
  CONSTRAINT "VarianteSucursal_varianteId_fkey" FOREIGN KEY("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VarianteSucursal_sucursalId_fkey" FOREIGN KEY("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "VarianteSucursal_sucursalId_habilitada_idx" ON "VarianteSucursal"("sucursalId","habilitada");
CREATE TABLE "PrecioModificador" (
  "id" TEXT NOT NULL PRIMARY KEY,"modificadorId" TEXT NOT NULL,
  "sucursalId" TEXT NOT NULL,"importe" DECIMAL(18,2) NOT NULL,
  "vigenteDesde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vigenteHasta" TIMESTAMPTZ(3),
  CONSTRAINT "PrecioModificador_modificadorId_fkey" FOREIGN KEY("modificadorId") REFERENCES "Modificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrecioModificador_sucursalId_fkey" FOREIGN KEY("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrecioModificador_valid" CHECK ("importe" >= 0 AND ("vigenteHasta" IS NULL OR "vigenteHasta" > "vigenteDesde")),
  CONSTRAINT "PrecioModificador_no_overlap" EXCLUDE USING gist ("modificadorId" WITH =, "sucursalId" WITH =, tstzrange("vigenteDesde", "vigenteHasta", '[)') WITH &&)
);
CREATE INDEX "PrecioModificador_modificadorId_sucursalId_vigenteDesde_idx" ON "PrecioModificador"("modificadorId","sucursalId","vigenteDesde");
