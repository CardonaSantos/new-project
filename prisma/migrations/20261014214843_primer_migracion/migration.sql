-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('ABIERTA', 'CERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenOrden" AS ENUM ('CAJA', 'MESERO', 'QUIOSCO', 'QR', 'WEB', 'TELEFONO', 'PLATAFORMA');

-- CreateEnum
CREATE TYPE "ModalidadServicio" AS ENUM ('MESA', 'MOSTRADOR', 'PARA_LLEVAR', 'DELIVERY');

-- CreateEnum
CREATE TYPE "EstadoComanda" AS ENUM ('PENDIENTE', 'PREPARANDO', 'LISTA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('PENDIENTE', 'EN_REPARTO', 'ENTREGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA', 'NO_ASISTIO');

-- CreateEnum
CREATE TYPE "EstadoRecordatorio" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CanalRecordatorio" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "TipoArticulo" AS ENUM ('INGREDIENTE', 'PREPARACION', 'PRODUCTO_TERMINADO', 'EMPAQUE', 'SUMINISTRO');

-- CreateEnum
CREATE TYPE "TipoProducto" AS ENUM ('PREPARADO', 'INVENTARIABLE', 'SERVICIO');

-- CreateEnum
CREATE TYPE "TipoReceta" AS ENUM ('VENTA', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "TipoConsumoOrden" AS ENUM ('RECETA', 'EMPAQUE');

-- CreateEnum
CREATE TYPE "EfectoModificador" AS ENUM ('SUMAR', 'RESTAR', 'SUSTITUIR');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('COMPRA', 'CONSUMO', 'PRODUCCION_ENTRADA', 'PRODUCCION_SALIDA', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'MERMA', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('BORRADOR', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('BORRADOR', 'EN_TRANSITO', 'RECIBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MetodoValoracion" AS ENUM ('PROMEDIO_PONDERADO', 'FIFO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoIntentoPago" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'FALLIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "TipoGasto" AS ENUM ('OPERATIVO', 'COMPRA_INVENTARIO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoProduccion" AS ENUM ('BORRADOR', 'CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('BORRADOR', 'CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoRequisicion" AS ENUM ('ABIERTA', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoDispositivo" AS ENUM ('POS', 'KDS', 'QUIOSCO', 'PANTALLA_TURNOS', 'IMPRESORA', 'OTRO');

-- CreateEnum
CREATE TYPE "UnidadDimension" AS ENUM ('UNIDAD', 'MASA', 'VOLUMEN', 'LONGITUD');

-- CreateEnum
CREATE TYPE "AlcanceEmpaque" AS ENUM ('ARTICULO', 'ORDEN');

-- CreateEnum
CREATE TYPE "EstadoSesionAutoservicio" AS ENUM ('ACTIVA', 'FINALIZADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('PENDIENTE', 'PROCESADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "TipoMedia" AS ENUM ('IMAGEN', 'VIDEO');

-- CreateTable
CREATE TABLE "EmpresaConfiguracion" (
    "id" TEXT NOT NULL,
    "nombreComercial" TEXT NOT NULL,
    "razonSocial" TEXT,
    "nit" TEXT,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'GTQ',
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Guatemala',
    "metodoValoracion" "MetodoValoracion" NOT NULL DEFAULT 'PROMEDIO_PONDERADO',
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmpresaConfiguracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Guatemala',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionSucursal" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "horaCorteOperativo" VARCHAR(5) NOT NULL DEFAULT '04:00',
    "exigeCobroAntesPreparar" BOOLEAN NOT NULL DEFAULT false,
    "permiteStockNegativo" BOOLEAN NOT NULL DEFAULT false,
    "permiteOrdenesQR" BOOLEAN NOT NULL DEFAULT false,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'GTQ',
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConfiguracionSucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoDispositivo" NOT NULL,
    "estacionPreparacionId" TEXT,
    "ultimoAccesoEn" TIMESTAMPTZ(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "versionAutorizacion" INTEGER NOT NULL DEFAULT 1,
    "ultimoAccesoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "hashRefreshToken" TEXT NOT NULL,
    "dispositivoId" TEXT,
    "expiraEn" TIMESTAMPTZ(3) NOT NULL,
    "revocadaEn" TIMESTAMPTZ(3),
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permiso" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,
    "modulo" TEXT NOT NULL,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolPermiso" (
    "id" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "permisoId" TEXT NOT NULL,

    CONSTRAINT "RolPermiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioRol" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioRol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAuditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "sucursalId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "motivo" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "parentId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "categoriaId" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoProducto" NOT NULL DEFAULT 'PREPARADO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "visibleEnMenu" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarianteProducto" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "articuloInventarioId" TEXT,
    "sku" TEXT,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VarianteProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioVariante" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "importe" DECIMAL(18,2) NOT NULL,
    "vigenteDesde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteHasta" TIMESTAMPTZ(3),

    CONSTRAINT "PrecioVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoModificador" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "minimo" INTEGER NOT NULL DEFAULT 0,
    "maximo" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GrupoModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modificador" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "incrementoPrecio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Modificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarianteGrupoModificador" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VarianteGrupoModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadMedida" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dimension" "UnidadDimension" NOT NULL,
    "esBase" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UnidadMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionUnidad" (
    "id" TEXT NOT NULL,
    "unidadOrigenId" TEXT NOT NULL,
    "unidadDestinoId" TEXT NOT NULL,
    "factor" DECIMAL(24,10) NOT NULL,

    CONSTRAINT "ConversionUnidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticuloInventario" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoArticulo" NOT NULL,
    "unidadBaseId" TEXT NOT NULL,
    "requiereLote" BOOLEAN NOT NULL DEFAULT false,
    "requiereVencimiento" BOOLEAN NOT NULL DEFAULT false,
    "costoReferencia" DECIMAL(18,6),
    "stockMinimo" DECIMAL(20,6),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ArticuloInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoReceta" NOT NULL,
    "varianteId" TEXT,
    "articuloResultadoId" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaVersion" (
    "id" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "rendimiento" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "unidadRendimientoId" TEXT NOT NULL,
    "publicadaEn" TIMESTAMPTZ(3),
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecetaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaComponente" (
    "id" TEXT NOT NULL,
    "recetaVersionId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "unidadId" TEXT NOT NULL,
    "mermaPorcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,

    CONSTRAINT "RecetaComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModificadorComponente" (
    "id" TEXT NOT NULL,
    "modificadorId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "efecto" "EfectoModificador" NOT NULL,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "unidadId" TEXT NOT NULL,
    "sustituyeArticuloId" TEXT,

    CONSTRAINT "ModificadorComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaEmpaque" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alcance" "AlcanceEmpaque" NOT NULL,
    "modalidad" "ModalidadServicio" NOT NULL,
    "varianteId" TEXT,
    "sucursalId" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReglaEmpaque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaEmpaqueLinea" (
    "id" TEXT NOT NULL,
    "reglaId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidad" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "ReglaEmpaqueLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Almacen" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Almacen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UbicacionAlmacen" (
    "id" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "esRecepcion" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UbicacionAlmacen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteInventario" (
    "id" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "codigoLote" TEXT NOT NULL,
    "fechaElaboracion" DATE,
    "fechaVencimiento" DATE,
    "costoOrigen" DECIMAL(18,6),
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoteInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Existencia" (
    "id" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidad" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "costoPromedio" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Existencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "costoUnitario" DECIMAL(18,6) NOT NULL,
    "costoTotal" DECIMAL(20,6) NOT NULL,
    "referenciaTipo" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "claveOperacion" TEXT NOT NULL,
    "nota" TEXT,
    "usuarioId" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapaCostoInventario" (
    "id" TEXT NOT NULL,
    "movimientoEntradaId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "cantidadInicial" DECIMAL(20,6) NOT NULL,
    "cantidadRestante" DECIMAL(20,6) NOT NULL,
    "costoUnitario" DECIMAL(18,6) NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapaCostoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionCapaCosto" (
    "id" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "movimientoSalidaId" TEXT NOT NULL,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "costoUnitario" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "AplicacionCapaCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConteoInventario" (
    "id" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'BORRADOR',
    "nota" TEXT,
    "confirmadoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConteoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConteoInventarioLinea" (
    "id" TEXT NOT NULL,
    "conteoId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidadTeorica" DECIMAL(20,6) NOT NULL,
    "cantidadContada" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "ConteoInventarioLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteInventario" (
    "id" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "conteoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'BORRADOR',
    "confirmadoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjusteInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteInventarioLinea" (
    "id" TEXT NOT NULL,
    "ajusteId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "deltaCantidad" DECIMAL(20,6) NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "AjusteInventarioLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduccionLote" (
    "id" TEXT NOT NULL,
    "recetaVersionId" TEXT NOT NULL,
    "ubicacionDestinoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "cantidadProducida" DECIMAL(20,6) NOT NULL,
    "loteResultadoId" TEXT,
    "estado" "EstadoProduccion" NOT NULL DEFAULT 'BORRADOR',
    "fechaVencimiento" DATE,
    "costoTotal" DECIMAL(20,6),
    "confirmadoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProduccionLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduccionConsumo" (
    "id" TEXT NOT NULL,
    "produccionId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "costoUnitario" DECIMAL(18,6) NOT NULL,
    "movimientoId" TEXT,

    CONSTRAINT "ProduccionConsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoOrden" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "comandaLineaId" TEXT,
    "tipo" "TipoConsumoOrden" NOT NULL,
    "recetaVersionId" TEXT,
    "cantidadPreparada" DECIMAL(18,3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumoOrden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoOrdenLinea" (
    "id" TEXT NOT NULL,
    "consumoId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "costoUnitario" DECIMAL(18,6) NOT NULL,
    "movimientoId" TEXT,

    CONSTRAINT "ConsumoOrdenLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentacionCompra" (
    "id" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "nombre" TEXT NOT NULL,
    "unidadCompraId" TEXT NOT NULL,
    "factorAUnidadBase" DECIMAL(24,10) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PresentacionCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "totalEstimado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEn" TIMESTAMPTZ(3),

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompraLinea" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "presentacionId" TEXT,
    "cantidadCompra" DECIMAL(20,6) NOT NULL,
    "factorAUnidadBase" DECIMAL(24,10) NOT NULL,
    "precioUnitarioCompra" DECIMAL(18,6) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "OrdenCompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecepcionCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ordenCompraId" TEXT,
    "proveedorId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'BORRADOR',
    "referenciaProveedor" TEXT,
    "observaciones" TEXT,
    "recibidoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecepcionCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecepcionCompraLinea" (
    "id" TEXT NOT NULL,
    "recepcionId" TEXT NOT NULL,
    "ordenCompraLineaId" TEXT,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "loteId" TEXT,
    "cantidadCompra" DECIMAL(20,6) NOT NULL,
    "factorAUnidadBase" DECIMAL(24,10) NOT NULL,
    "cantidadBase" DECIMAL(20,6) NOT NULL,
    "precioUnitarioCompra" DECIMAL(18,6) NOT NULL,
    "costoTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "RecepcionCompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaProveedor" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "referenciaFiscal" TEXT,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "impuestos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "observaciones" TEXT,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaProveedorLinea" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "recepcionLineaId" TEXT,
    "articuloId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(20,6) NOT NULL,
    "precioUnitario" DECIMAL(18,6) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "FacturaProveedorLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoProveedor" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "cuentaFinancieraId" TEXT,
    "turnoCajaId" TEXT,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "referencia" TEXT,
    "usuarioId" TEXT NOT NULL,
    "pagadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionPagoProveedor" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "AplicacionPagoProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisicion" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "almacenDestinoId" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "estado" "EstadoRequisicion" NOT NULL DEFAULT 'ABIERTA',
    "nota" TEXT,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidaEn" TIMESTAMPTZ(3),

    CONSTRAINT "Requisicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisicionLinea" (
    "id" TEXT NOT NULL,
    "requisicionId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidadSolicitada" DECIMAL(20,6) NOT NULL,
    "cantidadAtendida" DECIMAL(20,6) NOT NULL DEFAULT 0,

    CONSTRAINT "RequisicionLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaInventario" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "almacenOrigenId" TEXT NOT NULL,
    "almacenDestinoId" TEXT NOT NULL,
    "requisicionId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'BORRADOR',
    "nota" TEXT,
    "despachadaEn" TIMESTAMPTZ(3),
    "recibidaEn" TIMESTAMPTZ(3),

    CONSTRAINT "TransferenciaInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaInventarioLinea" (
    "id" TEXT NOT NULL,
    "transferenciaId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionOrigenId" TEXT NOT NULL,
    "ubicacionDestinoId" TEXT,
    "loteId" TEXT,
    "cantidadEnviada" DECIMAL(20,6) NOT NULL,
    "cantidadRecibida" DECIMAL(20,6),

    CONSTRAINT "TransferenciaInventarioLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DireccionCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "alias" TEXT,
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "latitud" DECIMAL(10,7),
    "longitud" DECIMAL(10,7),
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DireccionCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcupacionMesa" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "reservaId" TEXT,
    "abiertaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMPTZ(3),
    "abiertaPorId" TEXT NOT NULL,

    CONSTRAINT "OcupacionMesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orden" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "ocupacionMesaId" TEXT,
    "clienteId" TEXT,
    "usuarioId" TEXT,
    "modalidad" "ModalidadServicio" NOT NULL,
    "origen" "OrigenOrden" NOT NULL,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'ABIERTA',
    "version" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "descuentoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "abiertaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMPTZ(3),
    "canceladaEn" TIMESTAMPTZ(3),

    CONSTRAINT "Orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenLinea" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "nombreSnapshot" TEXT NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "notasCocina" TEXT,
    "canceladaEn" TIMESTAMPTZ(3),
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdenLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenLineaModificador" (
    "id" TEXT NOT NULL,
    "ordenLineaId" TEXT NOT NULL,
    "modificadorId" TEXT NOT NULL,
    "nombreSnapshot" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "recargoUnitario" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "OrdenLineaModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuenta" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "nombre" TEXT,
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'ABIERTA',
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pagado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "abiertaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMPTZ(3),

    CONSTRAINT "Cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaLinea" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "ordenLineaId" TEXT NOT NULL,
    "cantidadAsignada" DECIMAL(18,3) NOT NULL,
    "importeAsignado" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "CuentaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoOrden" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "detalles" JSONB,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoOrden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstacionPreparacion" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ubicacionConsumoId" TEXT,

    CONSTRAINT "EstacionPreparacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RutaPreparacion" (
    "id" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "varianteId" TEXT,
    "prioridad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RutaPreparacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comanda" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "estado" "EstadoComanda" NOT NULL DEFAULT 'PENDIENTE',
    "enviadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEn" TIMESTAMPTZ(3),
    "listaEn" TIMESTAMPTZ(3),
    "canceladaEn" TIMESTAMPTZ(3),

    CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComandaLinea" (
    "id" TEXT NOT NULL,
    "comandaId" TEXT NOT NULL,
    "ordenLineaId" TEXT NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "notasSnapshot" TEXT,
    "listaEn" TIMESTAMPTZ(3),
    "entregadaEn" TIMESTAMPTZ(3),
    "canceladaEn" TIMESTAMPTZ(3),

    CONSTRAINT "ComandaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoComanda" (
    "id" TEXT NOT NULL,
    "comandaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "nota" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoComanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoCaja" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "fechaOperativa" DATE NOT NULL,
    "fondoInicial" DECIMAL(18,2) NOT NULL,
    "efectivoEsperado" DECIMAL(18,2),
    "efectivoContado" DECIMAL(18,2),
    "diferencia" DECIMAL(18,2),
    "abiertaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMPTZ(3),
    "notaCierre" TEXT,

    CONSTRAINT "TurnoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "pagoId" TEXT,
    "reembolsoId" TEXT,
    "gastoId" TEXT,
    "pagoProveedorId" TEXT,
    "liquidacionRepartidorId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArqueoCaja" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "contado" DECIMAL(18,2) NOT NULL,
    "esperado" DECIMAL(18,2) NOT NULL,
    "diferencia" DECIMAL(18,2) NOT NULL,
    "realizadoPorId" TEXT NOT NULL,
    "nota" TEXT,
    "realizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArqueoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionProveedorPago" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "codigoProveedor" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "referenciaSecretos" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfiguracionProveedorPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoPago" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoIntentoPago" NOT NULL DEFAULT 'PENDIENTE',
    "claveIdempotencia" TEXT NOT NULL,
    "referenciaExterna" TEXT,
    "codigoAutorizacion" TEXT,
    "terminalReferencia" TEXT,
    "respuestaCodigo" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntentoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "intentoId" TEXT,
    "turnoId" TEXT,
    "cobradoPorId" TEXT,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "referencia" TEXT,
    "codigoAutorizacion" TEXT,
    "terminalReferencia" TEXT,
    "recibidoPorRepartidor" BOOLEAN NOT NULL DEFAULT false,
    "cobradoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReembolsoPago" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "referenciaExterna" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReembolsoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "clienteId" TEXT,
    "total" DECIMAL(18,2) NOT NULL,
    "descuentoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cerradaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaLinea" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "ordenLineaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "VentaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaFinanciera" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'GTQ',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CuentaFinanciera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoFinanciero" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "referenciaTipo" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "descripcion" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoFinanciero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoOperativo" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "cuentaFinancieraId" TEXT,
    "turnoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoGasto" NOT NULL DEFAULT 'OPERATIVO',
    "categoria" TEXT,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "documentoReferencia" TEXT,
    "registradoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoOperativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreOperativo" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fechaOperativa" DATE NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "resumen" JSONB,
    "cerradoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreOperativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanalExterno" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CanalExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrega" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "direccionId" TEXT,
    "direccionTexto" TEXT NOT NULL,
    "referenciaDireccion" TEXT,
    "telefonoContacto" TEXT,
    "repartidorId" TEXT,
    "canalExternoId" TEXT,
    "referenciaExterna" TEXT,
    "estado" "EstadoEntrega" NOT NULL DEFAULT 'PENDIENTE',
    "costoEnvio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cobrableContraEntrega" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "enRepartoEn" TIMESTAMPTZ(3),
    "entregadaEn" TIMESTAMPTZ(3),
    "nota" TEXT,

    CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionCanalExterno" (
    "id" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "cuentaFinancieraId" TEXT,
    "periodoInicio" DATE NOT NULL,
    "periodoFin" DATE NOT NULL,
    "referencia" TEXT,
    "totalBruto" DECIMAL(18,2) NOT NULL,
    "totalComision" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalNeto" DECIMAL(18,2) NOT NULL,
    "recibidaEn" TIMESTAMPTZ(3),
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidacionCanalExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionCanalExternoLinea" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "importeBruto" DECIMAL(18,2) NOT NULL,
    "comision" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importeNeto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LiquidacionCanalExternoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionRepartidor" (
    "id" TEXT NOT NULL,
    "repartidorId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "turnoCajaId" TEXT,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'ABIERTA',
    "totalEsperado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalEntregado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMPTZ(3),

    CONSTRAINT "LiquidacionRepartidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionRepartidorLinea" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LiquidacionRepartidorLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "clienteId" TEXT,
    "nombreContacto" TEXT NOT NULL,
    "telefonoContacto" TEXT,
    "emailContacto" TEXT,
    "personas" INTEGER NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "creadaPorId" TEXT,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaMesa" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,

    CONSTRAINT "ReservaMesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoReserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordatorioReserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "canal" "CanalRecordatorio" NOT NULL,
    "destino" TEXT NOT NULL,
    "textoSnapshot" TEXT NOT NULL,
    "programadoPara" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoRecordatorio" NOT NULL DEFAULT 'PENDIENTE',
    "enviadoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordatorioReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoRecordatorio" (
    "id" TEXT NOT NULL,
    "recordatorioId" TEXT NOT NULL,
    "referenciaProveedor" TEXT,
    "exito" BOOLEAN NOT NULL,
    "error" TEXT,
    "intentadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoRecordatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoMesaQR" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "hashToken" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoMesaQR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionAutoservicio" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "dispositivoId" TEXT,
    "accesoMesaQrId" TEXT,
    "ordenId" TEXT,
    "hashSesion" TEXT NOT NULL,
    "estado" "EstadoSesionAutoservicio" NOT NULL DEFAULT 'ACTIVA',
    "expiraEn" TIMESTAMPTZ(3) NOT NULL,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionAutoservicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoOutbox" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "agregado" TEXT NOT NULL,
    "agregadoId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" "EstadoEvento" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMPTZ(3),

    CONSTRAINT "EventoOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacionIdempotente" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "hashSolicitud" TEXT NOT NULL,
    "resultado" JSONB,
    "finalizada" BOOLEAN NOT NULL DEFAULT false,
    "expiraEn" TIMESTAMPTZ(3) NOT NULL,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperacionIdempotente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL DEFAULT 'DIGITALOCEAN_SPACES',
    "bucket" VARCHAR(255) NOT NULL,
    "region" VARCHAR(64),
    "claveObjeto" VARCHAR(1024) NOT NULL,
    "urlPublica" TEXT,
    "tipo" "TipoMedia" NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "nombreOriginal" TEXT,
    "tamanoBytes" BIGINT,
    "ancho" INTEGER,
    "alto" INTEGER,
    "duracionSegundos" DECIMAL(12,3),
    "etag" TEXT,
    "hashContenido" TEXT,
    "subidaPorId" TEXT,
    "confirmadaEn" TIMESTAMPTZ(3),
    "eliminadaEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "apellidos" TEXT,
    "telefono" TEXT,
    "idioma" TEXT NOT NULL DEFAULT 'es-GT',
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Guatemala',
    "avatarMediaId" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PerfilUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoMedia" (
    "productoId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductoMedia_pkey" PRIMARY KEY ("productoId","mediaId")
);

-- CreateTable
CREATE TABLE "VarianteProductoMedia" (
    "varianteId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VarianteProductoMedia_pkey" PRIMARY KEY ("varianteId","mediaId")
);

-- CreateTable
CREATE TABLE "ArticuloInventarioMedia" (
    "articuloId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticuloInventarioMedia_pkey" PRIMARY KEY ("articuloId","mediaId")
);

-- CreateTable
CREATE TABLE "CategoriaMedia" (
    "categoriaId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaMedia_pkey" PRIMARY KEY ("categoriaId","mediaId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_codigo_key" ON "Sucursal"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionSucursal_sucursalId_key" ON "ConfiguracionSucursal"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_sucursalId_codigo_key" ON "Dispositivo"("sucursalId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SesionUsuario_hashRefreshToken_key" ON "SesionUsuario"("hashRefreshToken");

-- CreateIndex
CREATE INDEX "SesionUsuario_usuarioId_revocadaEn_idx" ON "SesionUsuario"("usuarioId", "revocadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_codigo_key" ON "Rol"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_codigo_key" ON "Permiso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "RolPermiso_rolId_permisoId_key" ON "RolPermiso"("rolId", "permisoId");

-- CreateIndex
CREATE INDEX "UsuarioRol_sucursalId_usuarioId_idx" ON "UsuarioRol"("sucursalId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioRol_usuarioId_rolId_sucursalId_key" ON "UsuarioRol"("usuarioId", "rolId", "sucursalId");

-- CreateIndex
CREATE INDEX "EventoAuditoria_entidad_entidadId_creadoEn_idx" ON "EventoAuditoria"("entidad", "entidadId", "creadoEn");

-- CreateIndex
CREATE INDEX "EventoAuditoria_usuarioId_creadoEn_idx" ON "EventoAuditoria"("usuarioId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "VarianteProducto_sku_key" ON "VarianteProducto"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "VarianteProducto_productoId_nombre_key" ON "VarianteProducto"("productoId", "nombre");

-- CreateIndex
CREATE INDEX "PrecioVariante_varianteId_sucursalId_vigenteDesde_idx" ON "PrecioVariante"("varianteId", "sucursalId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Modificador_grupoId_nombre_key" ON "Modificador"("grupoId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "VarianteGrupoModificador_varianteId_grupoId_key" ON "VarianteGrupoModificador"("varianteId", "grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadMedida_codigo_key" ON "UnidadMedida"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionUnidad_unidadOrigenId_unidadDestinoId_key" ON "ConversionUnidad"("unidadOrigenId", "unidadDestinoId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticuloInventario_codigo_key" ON "ArticuloInventario"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaVersion_recetaId_numero_key" ON "RecetaVersion"("recetaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaComponente_recetaVersionId_articuloId_key" ON "RecetaComponente"("recetaVersionId", "articuloId");

-- CreateIndex
CREATE INDEX "ModificadorComponente_modificadorId_idx" ON "ModificadorComponente"("modificadorId");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaEmpaqueLinea_reglaId_articuloId_key" ON "ReglaEmpaqueLinea"("reglaId", "articuloId");

-- CreateIndex
CREATE UNIQUE INDEX "Almacen_sucursalId_codigo_key" ON "Almacen"("sucursalId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "UbicacionAlmacen_almacenId_codigo_key" ON "UbicacionAlmacen"("almacenId", "codigo");

-- CreateIndex
CREATE INDEX "LoteInventario_fechaVencimiento_idx" ON "LoteInventario"("fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "LoteInventario_articuloId_codigoLote_key" ON "LoteInventario"("articuloId", "codigoLote");

-- CreateIndex
CREATE INDEX "Existencia_ubicacionId_articuloId_idx" ON "Existencia"("ubicacionId", "articuloId");

-- CreateIndex
CREATE UNIQUE INDEX "Existencia_articuloId_ubicacionId_loteId_key" ON "Existencia"("articuloId", "ubicacionId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_claveOperacion_key" ON "MovimientoInventario"("claveOperacion");

-- CreateIndex
CREATE INDEX "MovimientoInventario_articuloId_creadoEn_idx" ON "MovimientoInventario"("articuloId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInventario_ubicacionId_creadoEn_idx" ON "MovimientoInventario"("ubicacionId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInventario_referenciaTipo_referenciaId_idx" ON "MovimientoInventario"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "CapaCostoInventario_movimientoEntradaId_key" ON "CapaCostoInventario"("movimientoEntradaId");

-- CreateIndex
CREATE INDEX "CapaCostoInventario_articuloId_ubicacionId_creadoEn_idx" ON "CapaCostoInventario"("articuloId", "ubicacionId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionCapaCosto_capaId_movimientoSalidaId_key" ON "AplicacionCapaCosto"("capaId", "movimientoSalidaId");

-- CreateIndex
CREATE INDEX "ConteoInventarioLinea_conteoId_articuloId_idx" ON "ConteoInventarioLinea"("conteoId", "articuloId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteInventario_conteoId_key" ON "AjusteInventario"("conteoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProduccionConsumo_movimientoId_key" ON "ProduccionConsumo"("movimientoId");

-- CreateIndex
CREATE INDEX "ConsumoOrden_comandaLineaId_idx" ON "ConsumoOrden"("comandaLineaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoOrdenLinea_movimientoId_key" ON "ConsumoOrdenLinea"("movimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_numero_key" ON "OrdenCompra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "RecepcionCompra_numero_key" ON "RecepcionCompra"("numero");

-- CreateIndex
CREATE INDEX "RecepcionCompraLinea_recepcionId_articuloId_idx" ON "RecepcionCompraLinea"("recepcionId", "articuloId");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaProveedor_proveedorId_numeroDocumento_key" ON "FacturaProveedor"("proveedorId", "numeroDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionPagoProveedor_pagoId_facturaId_key" ON "AplicacionPagoProveedor"("pagoId", "facturaId");

-- CreateIndex
CREATE UNIQUE INDEX "Requisicion_numero_key" ON "Requisicion"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaInventario_numero_key" ON "TransferenciaInventario"("numero");

-- CreateIndex
CREATE INDEX "TransferenciaInventarioLinea_transferenciaId_articuloId_idx" ON "TransferenciaInventarioLinea"("transferenciaId", "articuloId");

-- CreateIndex
CREATE UNIQUE INDEX "Sala_sucursalId_nombre_key" ON "Sala"("sucursalId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_salaId_numero_key" ON "Mesa"("salaId", "numero");

-- CreateIndex
CREATE INDEX "OcupacionMesa_mesaId_cerradaEn_idx" ON "OcupacionMesa"("mesaId", "cerradaEn");

-- CreateIndex
CREATE INDEX "Orden_sucursalId_estado_abiertaEn_idx" ON "Orden"("sucursalId", "estado", "abiertaEn");

-- CreateIndex
CREATE UNIQUE INDEX "Orden_sucursalId_numero_key" ON "Orden"("sucursalId", "numero");

-- CreateIndex
CREATE INDEX "OrdenLinea_ordenId_creadaEn_idx" ON "OrdenLinea"("ordenId", "creadaEn");

-- CreateIndex
CREATE INDEX "OrdenLineaModificador_ordenLineaId_idx" ON "OrdenLineaModificador"("ordenLineaId");

-- CreateIndex
CREATE INDEX "Cuenta_ordenId_estado_idx" ON "Cuenta"("ordenId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaLinea_cuentaId_ordenLineaId_key" ON "CuentaLinea"("cuentaId", "ordenLineaId");

-- CreateIndex
CREATE INDEX "EventoOrden_ordenId_creadoEn_idx" ON "EventoOrden"("ordenId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "EstacionPreparacion_sucursalId_nombre_key" ON "EstacionPreparacion"("sucursalId", "nombre");

-- CreateIndex
CREATE INDEX "Comanda_estacionId_estado_enviadaEn_idx" ON "Comanda"("estacionId", "estado", "enviadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "Comanda_estacionId_numero_key" ON "Comanda"("estacionId", "numero");

-- CreateIndex
CREATE INDEX "ComandaLinea_ordenLineaId_idx" ON "ComandaLinea"("ordenLineaId");

-- CreateIndex
CREATE INDEX "EventoComanda_comandaId_creadoEn_idx" ON "EventoComanda"("comandaId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Caja_sucursalId_codigo_key" ON "Caja"("sucursalId", "codigo");

-- CreateIndex
CREATE INDEX "TurnoCaja_cajaId_cerradaEn_idx" ON "TurnoCaja"("cajaId", "cerradaEn");

-- CreateIndex
CREATE INDEX "TurnoCaja_fechaOperativa_idx" ON "TurnoCaja"("fechaOperativa");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_pagoId_key" ON "MovimientoCaja"("pagoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_reembolsoId_key" ON "MovimientoCaja"("reembolsoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_gastoId_key" ON "MovimientoCaja"("gastoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_pagoProveedorId_key" ON "MovimientoCaja"("pagoProveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_liquidacionRepartidorId_key" ON "MovimientoCaja"("liquidacionRepartidorId");

-- CreateIndex
CREATE INDEX "MovimientoCaja_turnoId_creadoEn_idx" ON "MovimientoCaja"("turnoId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "ArqueoCaja_turnoId_key" ON "ArqueoCaja"("turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionProveedorPago_sucursalId_codigoProveedor_key" ON "ConfiguracionProveedorPago"("sucursalId", "codigoProveedor");

-- CreateIndex
CREATE UNIQUE INDEX "IntentoPago_claveIdempotencia_key" ON "IntentoPago"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "IntentoPago_proveedorId_referenciaExterna_idx" ON "IntentoPago"("proveedorId", "referenciaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_intentoId_key" ON "Pago"("intentoId");

-- CreateIndex
CREATE INDEX "Pago_cuentaId_cobradoEn_idx" ON "Pago"("cuentaId", "cobradoEn");

-- CreateIndex
CREATE INDEX "ReembolsoPago_pagoId_creadoEn_idx" ON "ReembolsoPago"("pagoId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_cuentaId_key" ON "Venta"("cuentaId");

-- CreateIndex
CREATE INDEX "Venta_sucursalId_cerradaEn_idx" ON "Venta"("sucursalId", "cerradaEn");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_sucursalId_numero_key" ON "Venta"("sucursalId", "numero");

-- CreateIndex
CREATE INDEX "VentaLinea_ventaId_idx" ON "VentaLinea"("ventaId");

-- CreateIndex
CREATE INDEX "MovimientoFinanciero_cuentaId_creadoEn_idx" ON "MovimientoFinanciero"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoFinanciero_referenciaTipo_referenciaId_idx" ON "MovimientoFinanciero"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "CierreOperativo_sucursalId_fechaOperativa_key" ON "CierreOperativo"("sucursalId", "fechaOperativa");

-- CreateIndex
CREATE UNIQUE INDEX "CanalExterno_codigo_key" ON "CanalExterno"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Entrega_ordenId_key" ON "Entrega"("ordenId");

-- CreateIndex
CREATE INDEX "Entrega_repartidorId_estado_idx" ON "Entrega"("repartidorId", "estado");

-- CreateIndex
CREATE INDEX "Entrega_canalExternoId_referenciaExterna_idx" ON "Entrega"("canalExternoId", "referenciaExterna");

-- CreateIndex
CREATE INDEX "LiquidacionCanalExterno_canalId_periodoInicio_idx" ON "LiquidacionCanalExterno"("canalId", "periodoInicio");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionCanalExternoLinea_entregaId_key" ON "LiquidacionCanalExternoLinea"("entregaId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionRepartidorLinea_pagoId_key" ON "LiquidacionRepartidorLinea"("pagoId");

-- CreateIndex
CREATE INDEX "LiquidacionRepartidorLinea_liquidacionId_entregaId_idx" ON "LiquidacionRepartidorLinea"("liquidacionId", "entregaId");

-- CreateIndex
CREATE INDEX "Reserva_sucursalId_inicio_estado_idx" ON "Reserva"("sucursalId", "inicio", "estado");

-- CreateIndex
CREATE INDEX "ReservaMesa_mesaId_idx" ON "ReservaMesa"("mesaId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaMesa_reservaId_mesaId_key" ON "ReservaMesa"("reservaId", "mesaId");

-- CreateIndex
CREATE INDEX "EventoReserva_reservaId_creadoEn_idx" ON "EventoReserva"("reservaId", "creadoEn");

-- CreateIndex
CREATE INDEX "RecordatorioReserva_estado_programadoPara_idx" ON "RecordatorioReserva"("estado", "programadoPara");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoMesaQR_hashToken_key" ON "AccesoMesaQR"("hashToken");

-- CreateIndex
CREATE INDEX "AccesoMesaQR_mesaId_activo_idx" ON "AccesoMesaQR"("mesaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "SesionAutoservicio_hashSesion_key" ON "SesionAutoservicio"("hashSesion");

-- CreateIndex
CREATE INDEX "EventoOutbox_estado_proximoIntentoEn_idx" ON "EventoOutbox"("estado", "proximoIntentoEn");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionIdempotente_clave_key" ON "OperacionIdempotente"("clave");

-- CreateIndex
CREATE INDEX "OperacionIdempotente_expiraEn_idx" ON "OperacionIdempotente"("expiraEn");

-- CreateIndex
CREATE INDEX "Media_eliminadaEn_idx" ON "Media"("eliminadaEn");

-- CreateIndex
CREATE INDEX "Media_tipo_creadoEn_idx" ON "Media"("tipo", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Media_proveedor_bucket_claveObjeto_key" ON "Media"("proveedor", "bucket", "claveObjeto");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilUsuario_usuarioId_key" ON "PerfilUsuario"("usuarioId");

-- CreateIndex
CREATE INDEX "PerfilUsuario_avatarMediaId_idx" ON "PerfilUsuario"("avatarMediaId");

-- CreateIndex
CREATE INDEX "ProductoMedia_productoId_principal_orden_idx" ON "ProductoMedia"("productoId", "principal", "orden");

-- CreateIndex
CREATE INDEX "ProductoMedia_mediaId_idx" ON "ProductoMedia"("mediaId");

-- CreateIndex
CREATE INDEX "VarianteProductoMedia_varianteId_principal_orden_idx" ON "VarianteProductoMedia"("varianteId", "principal", "orden");

-- CreateIndex
CREATE INDEX "VarianteProductoMedia_mediaId_idx" ON "VarianteProductoMedia"("mediaId");

-- CreateIndex
CREATE INDEX "ArticuloInventarioMedia_articuloId_principal_orden_idx" ON "ArticuloInventarioMedia"("articuloId", "principal", "orden");

-- CreateIndex
CREATE INDEX "ArticuloInventarioMedia_mediaId_idx" ON "ArticuloInventarioMedia"("mediaId");

-- CreateIndex
CREATE INDEX "CategoriaMedia_categoriaId_principal_orden_idx" ON "CategoriaMedia"("categoriaId", "principal", "orden");

-- CreateIndex
CREATE INDEX "CategoriaMedia_mediaId_idx" ON "CategoriaMedia"("mediaId");

-- AddForeignKey
ALTER TABLE "ConfiguracionSucursal" ADD CONSTRAINT "ConfiguracionSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_estacionPreparacionId_fkey" FOREIGN KEY ("estacionPreparacionId") REFERENCES "EstacionPreparacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionUsuario" ADD CONSTRAINT "SesionUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionUsuario" ADD CONSTRAINT "SesionUsuario_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "Permiso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteProducto" ADD CONSTRAINT "VarianteProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteProducto" ADD CONSTRAINT "VarianteProducto_articuloInventarioId_fkey" FOREIGN KEY ("articuloInventarioId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioVariante" ADD CONSTRAINT "PrecioVariante_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioVariante" ADD CONSTRAINT "PrecioVariante_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modificador" ADD CONSTRAINT "Modificador_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoModificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteGrupoModificador" ADD CONSTRAINT "VarianteGrupoModificador_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteGrupoModificador" ADD CONSTRAINT "VarianteGrupoModificador_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoModificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionUnidad" ADD CONSTRAINT "ConversionUnidad_unidadOrigenId_fkey" FOREIGN KEY ("unidadOrigenId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionUnidad" ADD CONSTRAINT "ConversionUnidad_unidadDestinoId_fkey" FOREIGN KEY ("unidadDestinoId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticuloInventario" ADD CONSTRAINT "ArticuloInventario_unidadBaseId_fkey" FOREIGN KEY ("unidadBaseId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_articuloResultadoId_fkey" FOREIGN KEY ("articuloResultadoId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaVersion" ADD CONSTRAINT "RecetaVersion_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaVersion" ADD CONSTRAINT "RecetaVersion_unidadRendimientoId_fkey" FOREIGN KEY ("unidadRendimientoId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaComponente" ADD CONSTRAINT "RecetaComponente_recetaVersionId_fkey" FOREIGN KEY ("recetaVersionId") REFERENCES "RecetaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaComponente" ADD CONSTRAINT "RecetaComponente_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaComponente" ADD CONSTRAINT "RecetaComponente_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificadorComponente" ADD CONSTRAINT "ModificadorComponente_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "Modificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificadorComponente" ADD CONSTRAINT "ModificadorComponente_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificadorComponente" ADD CONSTRAINT "ModificadorComponente_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificadorComponente" ADD CONSTRAINT "ModificadorComponente_sustituyeArticuloId_fkey" FOREIGN KEY ("sustituyeArticuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaEmpaque" ADD CONSTRAINT "ReglaEmpaque_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaEmpaque" ADD CONSTRAINT "ReglaEmpaque_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaEmpaqueLinea" ADD CONSTRAINT "ReglaEmpaqueLinea_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "ReglaEmpaque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaEmpaqueLinea" ADD CONSTRAINT "ReglaEmpaqueLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Almacen" ADD CONSTRAINT "Almacen_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UbicacionAlmacen" ADD CONSTRAINT "UbicacionAlmacen_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteInventario" ADD CONSTRAINT "LoteInventario_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Existencia" ADD CONSTRAINT "Existencia_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaCostoInventario" ADD CONSTRAINT "CapaCostoInventario_movimientoEntradaId_fkey" FOREIGN KEY ("movimientoEntradaId") REFERENCES "MovimientoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaCostoInventario" ADD CONSTRAINT "CapaCostoInventario_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaCostoInventario" ADD CONSTRAINT "CapaCostoInventario_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionCapaCosto" ADD CONSTRAINT "AplicacionCapaCosto_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CapaCostoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionCapaCosto" ADD CONSTRAINT "AplicacionCapaCosto_movimientoSalidaId_fkey" FOREIGN KEY ("movimientoSalidaId") REFERENCES "MovimientoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoInventario" ADD CONSTRAINT "ConteoInventario_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoInventario" ADD CONSTRAINT "ConteoInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoInventarioLinea" ADD CONSTRAINT "ConteoInventarioLinea_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "ConteoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoInventarioLinea" ADD CONSTRAINT "ConteoInventarioLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoInventarioLinea" ADD CONSTRAINT "ConteoInventarioLinea_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoInventarioLinea" ADD CONSTRAINT "ConteoInventarioLinea_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventario" ADD CONSTRAINT "AjusteInventario_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventario" ADD CONSTRAINT "AjusteInventario_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "ConteoInventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventario" ADD CONSTRAINT "AjusteInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventarioLinea" ADD CONSTRAINT "AjusteInventarioLinea_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES "AjusteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventarioLinea" ADD CONSTRAINT "AjusteInventarioLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventarioLinea" ADD CONSTRAINT "AjusteInventarioLinea_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteInventarioLinea" ADD CONSTRAINT "AjusteInventarioLinea_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_recetaVersionId_fkey" FOREIGN KEY ("recetaVersionId") REFERENCES "RecetaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_ubicacionDestinoId_fkey" FOREIGN KEY ("ubicacionDestinoId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_loteResultadoId_fkey" FOREIGN KEY ("loteResultadoId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionConsumo" ADD CONSTRAINT "ProduccionConsumo_produccionId_fkey" FOREIGN KEY ("produccionId") REFERENCES "ProduccionLote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionConsumo" ADD CONSTRAINT "ProduccionConsumo_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionConsumo" ADD CONSTRAINT "ProduccionConsumo_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionConsumo" ADD CONSTRAINT "ProduccionConsumo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionConsumo" ADD CONSTRAINT "ProduccionConsumo_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrden" ADD CONSTRAINT "ConsumoOrden_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrden" ADD CONSTRAINT "ConsumoOrden_comandaLineaId_fkey" FOREIGN KEY ("comandaLineaId") REFERENCES "ComandaLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrden" ADD CONSTRAINT "ConsumoOrden_recetaVersionId_fkey" FOREIGN KEY ("recetaVersionId") REFERENCES "RecetaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrdenLinea" ADD CONSTRAINT "ConsumoOrdenLinea_consumoId_fkey" FOREIGN KEY ("consumoId") REFERENCES "ConsumoOrden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrdenLinea" ADD CONSTRAINT "ConsumoOrdenLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrdenLinea" ADD CONSTRAINT "ConsumoOrdenLinea_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrdenLinea" ADD CONSTRAINT "ConsumoOrdenLinea_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoOrdenLinea" ADD CONSTRAINT "ConsumoOrdenLinea_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentacionCompra" ADD CONSTRAINT "PresentacionCompra_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentacionCompra" ADD CONSTRAINT "PresentacionCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentacionCompra" ADD CONSTRAINT "PresentacionCompra_unidadCompraId_fkey" FOREIGN KEY ("unidadCompraId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "PresentacionCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "RecepcionCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_ordenCompraLineaId_fkey" FOREIGN KEY ("ordenCompraLineaId") REFERENCES "OrdenCompraLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedorLinea" ADD CONSTRAINT "FacturaProveedorLinea_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedorLinea" ADD CONSTRAINT "FacturaProveedorLinea_recepcionLineaId_fkey" FOREIGN KEY ("recepcionLineaId") REFERENCES "RecepcionCompraLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedorLinea" ADD CONSTRAINT "FacturaProveedorLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_turnoCajaId_fkey" FOREIGN KEY ("turnoCajaId") REFERENCES "TurnoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPagoProveedor" ADD CONSTRAINT "AplicacionPagoProveedor_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPagoProveedor" ADD CONSTRAINT "AplicacionPagoProveedor_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_almacenDestinoId_fkey" FOREIGN KEY ("almacenDestinoId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicionLinea" ADD CONSTRAINT "RequisicionLinea_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicionLinea" ADD CONSTRAINT "RequisicionLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventario" ADD CONSTRAINT "TransferenciaInventario_almacenOrigenId_fkey" FOREIGN KEY ("almacenOrigenId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventario" ADD CONSTRAINT "TransferenciaInventario_almacenDestinoId_fkey" FOREIGN KEY ("almacenDestinoId") REFERENCES "Almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventario" ADD CONSTRAINT "TransferenciaInventario_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventario" ADD CONSTRAINT "TransferenciaInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventarioLinea" ADD CONSTRAINT "TransferenciaInventarioLinea_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventarioLinea" ADD CONSTRAINT "TransferenciaInventarioLinea_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventarioLinea" ADD CONSTRAINT "TransferenciaInventarioLinea_ubicacionOrigenId_fkey" FOREIGN KEY ("ubicacionOrigenId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventarioLinea" ADD CONSTRAINT "TransferenciaInventarioLinea_ubicacionDestinoId_fkey" FOREIGN KEY ("ubicacionDestinoId") REFERENCES "UbicacionAlmacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInventarioLinea" ADD CONSTRAINT "TransferenciaInventarioLinea_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteInventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DireccionCliente" ADD CONSTRAINT "DireccionCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sala" ADD CONSTRAINT "Sala_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcupacionMesa" ADD CONSTRAINT "OcupacionMesa_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcupacionMesa" ADD CONSTRAINT "OcupacionMesa_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcupacionMesa" ADD CONSTRAINT "OcupacionMesa_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_ocupacionMesaId_fkey" FOREIGN KEY ("ocupacionMesaId") REFERENCES "OcupacionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenLinea" ADD CONSTRAINT "OrdenLinea_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenLinea" ADD CONSTRAINT "OrdenLinea_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenLineaModificador" ADD CONSTRAINT "OrdenLineaModificador_ordenLineaId_fkey" FOREIGN KEY ("ordenLineaId") REFERENCES "OrdenLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenLineaModificador" ADD CONSTRAINT "OrdenLineaModificador_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "Modificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaLinea" ADD CONSTRAINT "CuentaLinea_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaLinea" ADD CONSTRAINT "CuentaLinea_ordenLineaId_fkey" FOREIGN KEY ("ordenLineaId") REFERENCES "OrdenLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOrden" ADD CONSTRAINT "EventoOrden_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOrden" ADD CONSTRAINT "EventoOrden_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstacionPreparacion" ADD CONSTRAINT "EstacionPreparacion_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstacionPreparacion" ADD CONSTRAINT "EstacionPreparacion_ubicacionConsumoId_fkey" FOREIGN KEY ("ubicacionConsumoId") REFERENCES "UbicacionAlmacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RutaPreparacion" ADD CONSTRAINT "RutaPreparacion_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionPreparacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RutaPreparacion" ADD CONSTRAINT "RutaPreparacion_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RutaPreparacion" ADD CONSTRAINT "RutaPreparacion_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionPreparacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaLinea" ADD CONSTRAINT "ComandaLinea_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaLinea" ADD CONSTRAINT "ComandaLinea_ordenLineaId_fkey" FOREIGN KEY ("ordenLineaId") REFERENCES "OrdenLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoComanda" ADD CONSTRAINT "EventoComanda_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoComanda" ADD CONSTRAINT "EventoComanda_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_reembolsoId_fkey" FOREIGN KEY ("reembolsoId") REFERENCES "ReembolsoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "GastoOperativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_pagoProveedorId_fkey" FOREIGN KEY ("pagoProveedorId") REFERENCES "PagoProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_liquidacionRepartidorId_fkey" FOREIGN KEY ("liquidacionRepartidorId") REFERENCES "LiquidacionRepartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_realizadoPorId_fkey" FOREIGN KEY ("realizadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracionProveedorPago" ADD CONSTRAINT "ConfiguracionProveedorPago_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoPago" ADD CONSTRAINT "IntentoPago_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoPago" ADD CONSTRAINT "IntentoPago_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "ConfiguracionProveedorPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "IntentoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cobradoPorId_fkey" FOREIGN KEY ("cobradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReembolsoPago" ADD CONSTRAINT "ReembolsoPago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReembolsoPago" ADD CONSTRAINT "ReembolsoPago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_ordenLineaId_fkey" FOREIGN KEY ("ordenLineaId") REFERENCES "OrdenLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaFinanciera" ADD CONSTRAINT "CuentaFinanciera_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFinanciero" ADD CONSTRAINT "MovimientoFinanciero_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreOperativo" ADD CONSTRAINT "CierreOperativo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreOperativo" ADD CONSTRAINT "CierreOperativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_direccionId_fkey" FOREIGN KEY ("direccionId") REFERENCES "DireccionCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_canalExternoId_fkey" FOREIGN KEY ("canalExternoId") REFERENCES "CanalExterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionCanalExterno" ADD CONSTRAINT "LiquidacionCanalExterno_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "CanalExterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionCanalExterno" ADD CONSTRAINT "LiquidacionCanalExterno_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionCanalExternoLinea" ADD CONSTRAINT "LiquidacionCanalExternoLinea_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "LiquidacionCanalExterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionCanalExternoLinea" ADD CONSTRAINT "LiquidacionCanalExternoLinea_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionRepartidor" ADD CONSTRAINT "LiquidacionRepartidor_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionRepartidor" ADD CONSTRAINT "LiquidacionRepartidor_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionRepartidor" ADD CONSTRAINT "LiquidacionRepartidor_turnoCajaId_fkey" FOREIGN KEY ("turnoCajaId") REFERENCES "TurnoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionRepartidorLinea" ADD CONSTRAINT "LiquidacionRepartidorLinea_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "LiquidacionRepartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionRepartidorLinea" ADD CONSTRAINT "LiquidacionRepartidorLinea_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionRepartidorLinea" ADD CONSTRAINT "LiquidacionRepartidorLinea_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaMesa" ADD CONSTRAINT "ReservaMesa_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaMesa" ADD CONSTRAINT "ReservaMesa_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoReserva" ADD CONSTRAINT "EventoReserva_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoReserva" ADD CONSTRAINT "EventoReserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordatorioReserva" ADD CONSTRAINT "RecordatorioReserva_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoRecordatorio" ADD CONSTRAINT "IntentoRecordatorio_recordatorioId_fkey" FOREIGN KEY ("recordatorioId") REFERENCES "RecordatorioReserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoMesaQR" ADD CONSTRAINT "AccesoMesaQR_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionAutoservicio" ADD CONSTRAINT "SesionAutoservicio_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionAutoservicio" ADD CONSTRAINT "SesionAutoservicio_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionAutoservicio" ADD CONSTRAINT "SesionAutoservicio_accesoMesaQrId_fkey" FOREIGN KEY ("accesoMesaQrId") REFERENCES "AccesoMesaQR"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionAutoservicio" ADD CONSTRAINT "SesionAutoservicio_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_subidaPorId_fkey" FOREIGN KEY ("subidaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilUsuario" ADD CONSTRAINT "PerfilUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilUsuario" ADD CONSTRAINT "PerfilUsuario_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoMedia" ADD CONSTRAINT "ProductoMedia_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoMedia" ADD CONSTRAINT "ProductoMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteProductoMedia" ADD CONSTRAINT "VarianteProductoMedia_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "VarianteProducto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteProductoMedia" ADD CONSTRAINT "VarianteProductoMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticuloInventarioMedia" ADD CONSTRAINT "ArticuloInventarioMedia_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "ArticuloInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticuloInventarioMedia" ADD CONSTRAINT "ArticuloInventarioMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaMedia" ADD CONSTRAINT "CategoriaMedia_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaMedia" ADD CONSTRAINT "CategoriaMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
