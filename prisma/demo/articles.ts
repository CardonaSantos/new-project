/**
 * Inventory articles for the demo, covering all five TipoArticulo values.
 *
 * Everything here is referenced by code, never by generated id, so the data
 * files can be cross-checked offline and the writer stays dumb. Codes are
 * prefixed DEMO- by the writer, which is also how the reset finds its own rows.
 *
 * `unidad` is the base unit the article is stocked in. Buying in sacks or
 * boxes is a purchase presentation, not a different article: flour is stocked
 * in grams and bought in 25 kg sacks.
 */

export type ArticleType =
  | 'INGREDIENTE'
  | 'PREPARACION'
  | 'PRODUCTO_TERMINADO'
  | 'EMPAQUE'
  | 'SUMINISTRO';

export interface DemoArticle {
  codigo: string;
  nombre: string;
  tipo: ArticleType;
  /** Base unit code, from the initial seed's reference units. */
  unidad: 'UND' | 'G' | 'ML';
  /** Reference cost per base unit, in GTQ. Purchases refine it per layer. */
  costo: number;
  lote?: boolean;
  vencimiento?: boolean;
  stockMinimo?: number;
}

/**
 * Perishables carry lot and expiry tracking; dry goods and packaging don't.
 * That split is what makes the repostería branch's quality control show
 * something real instead of a flag nobody set.
 */
export const articles: DemoArticle[] = [
  // --- Ingredientes secos y básicos -------------------------------------
  { codigo: 'ING-HARINA', nombre: 'Harina de trigo', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.004299, stockMinimo: 25000 },
  { codigo: 'ING-AZUCAR', nombre: 'Azúcar blanca', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.007716, stockMinimo: 20000 },
  { codigo: 'ING-AZUCAR-GLAS', nombre: 'Azúcar glas', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0122, stockMinimo: 5000 },
  { codigo: 'ING-SAL', nombre: 'Sal refinada', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.003704, stockMinimo: 3000 },
  { codigo: 'ING-LEVADURA', nombre: 'Levadura seca', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0683, stockMinimo: 1000 },
  { codigo: 'ING-POLVO-HORNEAR', nombre: 'Polvo para hornear', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0419, stockMinimo: 1000 },
  { codigo: 'ING-CACAO', nombre: 'Cacao en polvo', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0948, stockMinimo: 3000 },
  { codigo: 'ING-CHOCOLATE', nombre: 'Chocolate cobertura 55%', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1146, stockMinimo: 5000 },
  { codigo: 'ING-VAINILLA', nombre: 'Extracto de vainilla', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.1850, stockMinimo: 500 },
  { codigo: 'ING-GELATINA', nombre: 'Grenetina sin sabor', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1852, stockMinimo: 500 },
  { codigo: 'ING-ACEITE', nombre: 'Aceite vegetal', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0198, stockMinimo: 10000 },
  { codigo: 'ING-ARROZ', nombre: 'Arroz blanco', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.009921, stockMinimo: 15000 },
  { codigo: 'ING-FRIJOL', nombre: 'Frijol negro', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0116, stockMinimo: 10000 },
  { codigo: 'ING-PASTA', nombre: 'Pasta espagueti', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0163, stockMinimo: 8000 },
  { codigo: 'ING-ESPECIAS', nombre: 'Mezcla de especias', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0970, stockMinimo: 1000 },
  { codigo: 'ING-PAPA', nombre: 'Papa para freír', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.006834, stockMinimo: 20000 },

  // --- Perecederos: lote y vencimiento ----------------------------------
  { codigo: 'ING-MANTEQUILLA', nombre: 'Mantequilla sin sal', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0639, lote: true, vencimiento: true, stockMinimo: 10000 },
  { codigo: 'ING-HUEVO', nombre: 'Huevo fresco', tipo: 'INGREDIENTE', unidad: 'UND', costo: 1.9000, lote: true, vencimiento: true, stockMinimo: 120 },
  { codigo: 'ING-LECHE', nombre: 'Leche entera', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0165, lote: true, vencimiento: true, stockMinimo: 20000 },
  { codigo: 'ING-CREMA', nombre: 'Crema para batir 35%', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0430, lote: true, vencimiento: true, stockMinimo: 5000 },
  { codigo: 'ING-LECHE-CONDENSADA', nombre: 'Leche condensada', tipo: 'INGREDIENTE', unidad: 'UND', costo: 13.00, lote: true, vencimiento: true, stockMinimo: 24 },
  { codigo: 'ING-LECHE-EVAPORADA', nombre: 'Leche evaporada', tipo: 'INGREDIENTE', unidad: 'UND', costo: 11.00, lote: true, vencimiento: true, stockMinimo: 24 },
  { codigo: 'ING-QUESO-CREMA', nombre: 'Queso crema', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0584, lote: true, vencimiento: true, stockMinimo: 4000 },
  { codigo: 'ING-QUESO-AMARILLO', nombre: 'Queso amarillo en rebanadas', tipo: 'INGREDIENTE', unidad: 'UND', costo: 1.0500, lote: true, vencimiento: true, stockMinimo: 150 },
  { codigo: 'ING-FRESA', nombre: 'Fresa fresca', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0408, lote: true, vencimiento: true, stockMinimo: 3000 },
  { codigo: 'ING-BANANO', nombre: 'Banano', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0066, lote: true, vencimiento: true, stockMinimo: 5000 },
  { codigo: 'ING-LIMON', nombre: 'Limón', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.8000, lote: true, vencimiento: true, stockMinimo: 60 },
  { codigo: 'ING-TOMATE', nombre: 'Tomate', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0110, lote: true, vencimiento: true, stockMinimo: 8000 },
  { codigo: 'ING-LECHUGA', nombre: 'Lechuga', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0105, lote: true, vencimiento: true, stockMinimo: 4000 },
  { codigo: 'ING-CEBOLLA', nombre: 'Cebolla blanca', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.009308, lote: true, stockMinimo: 6000 },
  { codigo: 'ING-CARNE-MOLIDA', nombre: 'Carne molida de res', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0761, lote: true, vencimiento: true, stockMinimo: 10000 },
  { codigo: 'ING-LOMO-RES', nombre: 'Lomo de res', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1080, lote: true, vencimiento: true, stockMinimo: 6000 },
  { codigo: 'ING-POLLO', nombre: 'Pechuga de pollo', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0309, lote: true, vencimiento: true, stockMinimo: 12000 },
  { codigo: 'ING-TOCINO', nombre: 'Tocino', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0871, lote: true, vencimiento: true, stockMinimo: 3000 },
  { codigo: 'ING-CAMARON', nombre: 'Camarón mediano', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1676, lote: true, vencimiento: true, stockMinimo: 3000 },
  { codigo: 'ING-PESCADO', nombre: 'Filete de pescado', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0882, lote: true, vencimiento: true, stockMinimo: 4000 },
  { codigo: 'ING-PAN-HAMBURGUESA', nombre: 'Pan de hamburguesa', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.0000, lote: true, vencimiento: true, stockMinimo: 100 },
  { codigo: 'ING-TORTILLA', nombre: 'Tortilla de maíz', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.4000, lote: true, vencimiento: true, stockMinimo: 200 },

  // --- Café, té y bebidas base ------------------------------------------
  { codigo: 'ING-CAFE-GRANO', nombre: 'Café en grano arábica', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0992, lote: true, stockMinimo: 8000 },
  { codigo: 'ING-CAFE-DESCAF', nombre: 'Café en grano descafeinado', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1168, lote: true, stockMinimo: 2000 },
  { codigo: 'ING-TE-NEGRO', nombre: 'Té negro en hebras', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1367, stockMinimo: 1000 },
  { codigo: 'ING-LECHE-ALMENDRA', nombre: 'Bebida de almendra', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0320, lote: true, vencimiento: true, stockMinimo: 6000 },
  { codigo: 'ING-LECHE-DESLACT', nombre: 'Leche deslactosada', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0205, lote: true, vencimiento: true, stockMinimo: 6000 },
  { codigo: 'ING-JAMAICA', nombre: 'Rosa de jamaica', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0838, stockMinimo: 2000 },
  { codigo: 'ING-CANELA', nombre: 'Canela en raja', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.1058, stockMinimo: 500 },
  { codigo: 'ING-HIELO', nombre: 'Hielo', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.002646, stockMinimo: 20000 },

  // --- Preparaciones: salen de recetas de producción --------------------
  { codigo: 'PRE-MASA-HOJALDRE', nombre: 'Masa de hojaldre', tipo: 'PREPARACION', unidad: 'G', costo: 0.0294, lote: true, vencimiento: true },
  { codigo: 'PRE-BIZCOCHO-VAINILLA', nombre: 'Bizcocho de vainilla', tipo: 'PREPARACION', unidad: 'G', costo: 0.0234, lote: true, vencimiento: true },
  { codigo: 'PRE-BIZCOCHO-CHOCOLATE', nombre: 'Bizcocho de chocolate', tipo: 'PREPARACION', unidad: 'G', costo: 0.0259, lote: true, vencimiento: true },
  { codigo: 'PRE-CREMA-PASTELERA', nombre: 'Crema pastelera', tipo: 'PREPARACION', unidad: 'G', costo: 0.0257, lote: true, vencimiento: true },
  { codigo: 'PRE-GANACHE', nombre: 'Ganache de chocolate', tipo: 'PREPARACION', unidad: 'G', costo: 0.0824, lote: true, vencimiento: true },
  { codigo: 'PRE-BETUN-QUESO', nombre: 'Betún de queso crema', tipo: 'PREPARACION', unidad: 'G', costo: 0.0461, lote: true, vencimiento: true },
  { codigo: 'PRE-JARABE-VAINILLA', nombre: 'Jarabe de vainilla', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0125, lote: true },
  { codigo: 'PRE-JARABE-CARAMELO', nombre: 'Jarabe de caramelo', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0095, lote: true },
  { codigo: 'PRE-SALSA-TOMATE', nombre: 'Salsa de tomate de la casa', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0159, lote: true, vencimiento: true },
  { codigo: 'PRE-SALSA-BBQ', nombre: 'Salsa BBQ de la casa', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0157, lote: true, vencimiento: true },
  { codigo: 'PRE-ADEREZO-CESAR', nombre: 'Aderezo césar', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0281, lote: true, vencimiento: true },
  { codigo: 'PRE-CALDO-POLLO', nombre: 'Caldo de pollo concentrado', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0145, lote: true, vencimiento: true },

  // --- Producto terminado: se produce y se vende por unidad -------------
  { codigo: 'PT-PASTEL-CHOCOLATE', nombre: 'Pastel de chocolate entero', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 82.67, lote: true, vencimiento: true, stockMinimo: 2 },
  { codigo: 'PT-PASTEL-FRESA', nombre: 'Pastel de fresa entero', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 61.13, lote: true, vencimiento: true, stockMinimo: 2 },

  // --- Bebidas embotelladas: venta directa (sin receta) -----------------
  { codigo: 'BEB-AGUA-600', nombre: 'Agua pura 600 ml', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 2.5833, stockMinimo: 48 },
  { codigo: 'BEB-REFRESCO-355', nombre: 'Refresco en lata 355 ml', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 4.7917, stockMinimo: 48 },
  { codigo: 'BEB-JUGO-500', nombre: 'Jugo natural embotellado 500 ml', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 7.0000, lote: true, vencimiento: true, stockMinimo: 24 },
  { codigo: 'BEB-CERVEZA-355', nombre: 'Cerveza nacional 355 ml', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 8.2500, stockMinimo: 48 },

  // --- Empaques: consumidos por reglas, no por recetas ------------------
  { codigo: 'EMP-VASO-12', nombre: 'Vaso caliente 12 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.0400, stockMinimo: 200 },
  { codigo: 'EMP-VASO-16', nombre: 'Vaso caliente 16 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.2300, stockMinimo: 200 },
  { codigo: 'EMP-VASO-FRIO-16', nombre: 'Vaso frío 16 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.1600, stockMinimo: 200 },
  { codigo: 'EMP-TAPA', nombre: 'Tapa para vaso', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.3900, stockMinimo: 300 },
  { codigo: 'EMP-FAJA', nombre: 'Faja de cartón', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.2600, stockMinimo: 200 },
  { codigo: 'EMP-POPOTE', nombre: 'Popote biodegradable', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.1650, stockMinimo: 300 },
  { codigo: 'EMP-CAJA-PASTEL', nombre: 'Caja para pastel', tipo: 'EMPAQUE', unidad: 'UND', costo: 4.3000, stockMinimo: 40 },
  { codigo: 'EMP-CAJA-REBANADA', nombre: 'Caja para rebanada', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.8000, stockMinimo: 80 },
  { codigo: 'EMP-CONTENEDOR', nombre: 'Contenedor para alimentos', tipo: 'EMPAQUE', unidad: 'UND', costo: 2.2400, stockMinimo: 150 },
  { codigo: 'EMP-BOLSA-PAPEL', nombre: 'Bolsa de papel', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.7900, stockMinimo: 200 },
  { codigo: 'EMP-BOLSA-DELIVERY', nombre: 'Bolsa sellada para delivery', tipo: 'EMPAQUE', unidad: 'UND', costo: 2.0400, stockMinimo: 150 },
  { codigo: 'EMP-SERVILLETA', nombre: 'Servilleta', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.0840, stockMinimo: 1000 },
  { codigo: 'EMP-CUBIERTOS', nombre: 'Juego de cubiertos desechables', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.8800, stockMinimo: 200 },

  // --- Suministros: consumo interno, nunca se venden --------------------
  { codigo: 'SUM-DETERGENTE', nombre: 'Detergente para cocina', tipo: 'SUMINISTRO', unidad: 'ML', costo: 0.0112, stockMinimo: 4000 },
  { codigo: 'SUM-GUANTES', nombre: 'Guantes de nitrilo', tipo: 'SUMINISTRO', unidad: 'UND', costo: 0.6250, stockMinimo: 200 },
  { codigo: 'SUM-BOLSA-BASURA', nombre: 'Bolsa para basura', tipo: 'SUMINISTRO', unidad: 'UND', costo: 1.3200, stockMinimo: 100 },
  { codigo: 'SUM-PAPEL-COCINA', nombre: 'Papel de cocina', tipo: 'SUMINISTRO', unidad: 'UND', costo: 8.0000, stockMinimo: 20 },
];
