/**
 * Inventario de Café Pepita de Oro, Antigua Guatemala.
 *
 * Todo se referencia por código, nunca por id generado, para que los archivos
 * de datos se puedan cruzar sin base de datos. El código es el que el negocio
 * ve en pantalla: sin prefijos de demo.
 *
 * `unidad` es la unidad base en que se lleva la existencia. Comprar por libra,
 * caja o galón es una presentación de compra, no otro artículo: el café se
 * lleva en gramos y se compra en bolsas de 5 lb.
 *
 * Costos de referencia por unidad base, en quetzales, a precios de proveedor
 * de noviembre de 2026. Cada compra los refina por capa de costo.
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
  /** Unidad base, de las que registra la semilla inicial. */
  unidad: 'UND' | 'G' | 'ML';
  /** Costo de referencia por unidad base, en GTQ. */
  costo: number;
  lote?: boolean;
  vencimiento?: boolean;
  stockMinimo?: number;
}

/**
 * Medidas de cocina. Una receta puede pedir «2 cucharadas de leche
 * condensada» en lugar de 30 ml: el componente guarda la unidad con que se
 * escribió y el sistema convierte a la unidad base del artículo con la tabla
 * de conversiones, que es global y exige la misma dimensión. Por eso la
 * cucharada de los líquidos es de volumen (15 ml) y la del café molido es su
 * propia unidad de masa (7 g, cucharada colmada): una cucharada de volumen no
 * tiene cómo convertirse a los gramos del café. Las tres se crean como en la
 * pantalla «Unidades y conversiones».
 */
export type KitchenUnitCode = 'CDA' | 'CDTA' | 'CDA-CAFE';
export interface KitchenUnit {
  codigo: KitchenUnitCode;
  nombre: string;
  dimension: 'MASA' | 'VOLUMEN';
  base: 'G' | 'ML';
  /** Unidades base que vale una de esta unidad. */
  factor: number;
}
export const KITCHEN_UNITS: KitchenUnit[] = [
  { codigo: 'CDA', nombre: 'Cucharada', dimension: 'VOLUMEN', base: 'ML', factor: 15 },
  { codigo: 'CDTA', nombre: 'Cucharadita', dimension: 'VOLUMEN', base: 'ML', factor: 5 },
  { codigo: 'CDA-CAFE', nombre: 'Cucharada de café molido', dimension: 'MASA', base: 'G', factor: 7 },
];

/**
 * La cantidad de un componente en la unidad base de su artículo. Todo lo que
 * planifica, compra, valida o simula pasa por aquí: leer `cantidad` directo
 * contaría dos cucharadas como dos mililitros.
 */
export function baseQty(component: { cantidad: number; unidad?: KitchenUnitCode }): number {
  if (!component.unidad) return component.cantidad;
  const unit = KITCHEN_UNITS.find((u) => u.codigo === component.unidad)!;
  return component.cantidad * unit.factor;
}

export const articles: DemoArticle[] = [
  // Café de la casa: un solo origen, Antigua, en dos tuestes.
  { codigo: 'CAF-GRANO', nombre: 'Café en grano Antigua, tueste espresso', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.194, lote: true, vencimiento: true, stockMinimo: 2000 },
  { codigo: 'CAF-MOLIDO', nombre: 'Café molido Antigua, tueste medio', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.176, lote: true, vencimiento: true, stockMinimo: 1500 },

  // Lácteos y refrigerados: lote y vencimiento, que es lo que el control de
  // calidad y el reporte de vencimientos leen.
  { codigo: 'LAC-LECHE-ENTERA', nombre: 'Leche entera', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0125, lote: true, vencimiento: true, stockMinimo: 10000 },
  { codigo: 'LAC-LECHE-DESLACT', nombre: 'Leche deslactosada', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0145, lote: true, vencimiento: true, stockMinimo: 3000 },
  { codigo: 'LAC-BEBIDA-ALMENDRA', nombre: 'Bebida de almendra', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.032, lote: true, vencimiento: true, stockMinimo: 2000 },
  { codigo: 'LAC-BEBIDA-AVENA', nombre: 'Bebida de avena', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.034, lote: true, vencimiento: true, stockMinimo: 2000 },
  { codigo: 'LAC-CREMA-BATIR', nombre: 'Crema para batir', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.045, lote: true, vencimiento: true, stockMinimo: 1000 },
  { codigo: 'LAC-CREMA', nombre: 'Crema fresca', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.03, lote: true, vencimiento: true, stockMinimo: 1000 },
  { codigo: 'LAC-LECHE-CONDENSADA', nombre: 'Leche condensada', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.043, stockMinimo: 600 },
  { codigo: 'LAC-QUESO-FRESCO', nombre: 'Queso fresco', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.07, lote: true, vencimiento: true, stockMinimo: 500 },
  { codigo: 'LAC-QUESO-AMARILLO', nombre: 'Queso amarillo en rebanadas', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.17, lote: true, vencimiento: true, stockMinimo: 24 },
  { codigo: 'LAC-MANTEQUILLA', nombre: 'Mantequilla sin sal', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.062, lote: true, vencimiento: true, stockMinimo: 500 },
  { codigo: 'LAC-HUEVO', nombre: 'Huevo de granja', tipo: 'INGREDIENTE', unidad: 'UND', costo: 1.3, lote: true, vencimiento: true, stockMinimo: 60 },
  { codigo: 'CAR-JAMON', nombre: 'Jamón de pavo en rebanadas', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.5, lote: true, vencimiento: true, stockMinimo: 20 },
  { codigo: 'CAR-TOCINO', nombre: 'Tocino ahumado en tiras', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.5, lote: true, vencimiento: true, stockMinimo: 24 },

  // Secos, endulzantes y saborizantes.
  { codigo: 'SEC-AZUCAR', nombre: 'Azúcar blanca', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0105, stockMinimo: 5000 },
  { codigo: 'SEC-AZUCAR-SOBRE', nombre: 'Sobre de azúcar', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.076, stockMinimo: 300 },
  { codigo: 'SEC-STEVIA-SOBRE', nombre: 'Sobre de stevia', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.35, stockMinimo: 100 },
  { codigo: 'SEC-CANELA-RAJA', nombre: 'Canela en raja', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.55, stockMinimo: 30 },
  { codigo: 'SEC-CANELA-MOLIDA', nombre: 'Canela molida', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.24, stockMinimo: 100 },
  { codigo: 'SEC-CHOCOLATE-TABLILLA', nombre: 'Chocolate de tablilla artesanal', tipo: 'INGREDIENTE', unidad: 'UND', costo: 3.5, stockMinimo: 12 },
  { codigo: 'SEC-SALSA-CHOCOLATE', nombre: 'Salsa de chocolate', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0605, stockMinimo: 1000 },
  { codigo: 'SEC-JARABE-CARAMELO', nombre: 'Jarabe de caramelo', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0853, stockMinimo: 750 },
  { codigo: 'SEC-JARABE-AVELLANA', nombre: 'Jarabe de avellana', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0853, stockMinimo: 750 },
  { codigo: 'SEC-EXTRACTO-VAINILLA', nombre: 'Extracto de vainilla', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.14, stockMinimo: 100 },
  { codigo: 'SEC-CHAI', nombre: 'Concentrado de té chai', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0899, stockMinimo: 946 },
  { codigo: 'SEC-TE-SOBRE', nombre: 'Té en sobre (manzanilla, limón, negro)', tipo: 'INGREDIENTE', unidad: 'UND', costo: 1.2, stockMinimo: 30 },
  { codigo: 'SEC-MIEL', nombre: 'Miel de abeja', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.08, stockMinimo: 500 },
  { codigo: 'SEC-HARINA', nombre: 'Harina de trigo', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0084, stockMinimo: 3000 },
  { codigo: 'SEC-POLVO-HORNEAR', nombre: 'Polvo de hornear', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.056, stockMinimo: 100 },
  { codigo: 'SEC-FRIJOL-NEGRO', nombre: 'Frijol negro', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0123, stockMinimo: 2000 },
  { codigo: 'SEC-ACEITE', nombre: 'Aceite vegetal', tipo: 'INGREDIENTE', unidad: 'ML', costo: 0.0238, stockMinimo: 2000 },
  { codigo: 'SEC-SAL', nombre: 'Sal', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.005, stockMinimo: 500 },
  { codigo: 'SEC-CHISPAS-CHOCOLATE', nombre: 'Chispas de chocolate', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.08, stockMinimo: 300 },
  { codigo: 'HIE-HIELO', nombre: 'Hielo en cubos', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0035, stockMinimo: 10000 },

  // Del mercado de Antigua, compra semanal.
  { codigo: 'VER-PLATANO', nombre: 'Plátano maduro', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.0, stockMinimo: 12 },
  { codigo: 'VER-BANANO', nombre: 'Banano', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.6, stockMinimo: 15 },
  { codigo: 'VER-AGUACATE', nombre: 'Aguacate Hass', tipo: 'INGREDIENTE', unidad: 'UND', costo: 5.0, stockMinimo: 8 },
  { codigo: 'VER-FRESA', nombre: 'Fresa', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.031, stockMinimo: 500 },
  { codigo: 'VER-LIMON', nombre: 'Limón criollo', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.5, stockMinimo: 40 },
  { codigo: 'VER-HIERBABUENA', nombre: 'Hierbabuena', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.06, stockMinimo: 50 },
  { codigo: 'VER-TOMATE', nombre: 'Tomate', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.011, stockMinimo: 1000 },
  { codigo: 'VER-CEBOLLA', nombre: 'Cebolla blanca', tipo: 'INGREDIENTE', unidad: 'G', costo: 0.0088, stockMinimo: 500 },
  { codigo: 'VER-ELOTE', nombre: 'Elote tierno', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.5, stockMinimo: 12 },

  // De la panadería aliada, entrega diaria.
  { codigo: 'PAN-FRANCES', nombre: 'Pan francés', tipo: 'INGREDIENTE', unidad: 'UND', costo: 1.0, stockMinimo: 20 },
  { codigo: 'PAN-CROISSANT', nombre: 'Croissant de mantequilla', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 6.5, stockMinimo: 12 },
  { codigo: 'PAN-CHAMPURRADA', nombre: 'Champurrada', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 1.5, stockMinimo: 30 },
  { codigo: 'PAN-MASA-MADRE', nombre: 'Pan de masa madre (rebanada)', tipo: 'INGREDIENTE', unidad: 'UND', costo: 2.5, stockMinimo: 20 },
  { codigo: 'PAN-TORTILLA', nombre: 'Tortilla de maíz', tipo: 'INGREDIENTE', unidad: 'UND', costo: 0.5, stockMinimo: 30 },

  // Postres de la repostería aliada, por porción.
  { codigo: 'POS-CHEESECAKE', nombre: 'Cheesecake de fresa (porción)', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 16.0, lote: true, vencimiento: true, stockMinimo: 4 },
  { codigo: 'POS-TRES-LECHES', nombre: 'Pastel de tres leches (porción)', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 14.0, lote: true, vencimiento: true, stockMinimo: 4 },

  // Embotelladas, se venden tal cual.
  { codigo: 'BEB-AGUA-PURA', nombre: 'Agua pura 600 ml', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 3.0, stockMinimo: 24 },
  { codigo: 'BEB-AGUA-MINERAL', nombre: 'Agua mineral 355 ml', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 8.0, stockMinimo: 12 },

  // Lo que se produce en la cocina de la casa.
  { codigo: 'PRE-JARABE-SIMPLE', nombre: 'Jarabe simple', tipo: 'PREPARACION', unidad: 'ML', costo: 0.0085, lote: true, vencimiento: true },
  { codigo: 'PRE-JARABE-VAINILLA', nombre: 'Jarabe de vainilla de la casa', tipo: 'PREPARACION', unidad: 'ML', costo: 0.013, lote: true, vencimiento: true },
  { codigo: 'PRE-COLD-BREW', nombre: 'Concentrado de cold brew', tipo: 'PREPARACION', unidad: 'ML', costo: 0.03, lote: true, vencimiento: true },
  { codigo: 'PRE-FRIJOL-VOLTEADO', nombre: 'Frijoles volteados', tipo: 'PREPARACION', unidad: 'G', costo: 0.009, lote: true, vencimiento: true },
  { codigo: 'PRE-ATOL-ELOTE', nombre: 'Atol de elote', tipo: 'PREPARACION', unidad: 'ML', costo: 0.02, lote: true, vencimiento: true },
  { codigo: 'PRE-PAN-BANANO', nombre: 'Pan de banano (rebanada)', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 4.0, lote: true, vencimiento: true, stockMinimo: 5 },
  { codigo: 'PRE-RELLENITO', nombre: 'Rellenito de plátano', tipo: 'PRODUCTO_TERMINADO', unidad: 'UND', costo: 2.2, lote: true, vencimiento: true, stockMinimo: 6 },

  // Empaque para llevar y domicilio.
  { codigo: 'EMP-VASO-8', nombre: 'Vaso caliente 8 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.85, stockMinimo: 100 },
  { codigo: 'EMP-VASO-12', nombre: 'Vaso caliente 12 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.98, stockMinimo: 100 },
  { codigo: 'EMP-VASO-16', nombre: 'Vaso caliente 16 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.1, stockMinimo: 50 },
  { codigo: 'EMP-VASO-FRIO-16', nombre: 'Vaso frío 16 oz', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.1, stockMinimo: 100 },
  { codigo: 'EMP-TAPA', nombre: 'Tapa para vaso', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.35, stockMinimo: 200 },
  { codigo: 'EMP-FAJA', nombre: 'Faja de cartón', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.25, stockMinimo: 100 },
  { codigo: 'EMP-POPOTE', nombre: 'Popote de papel', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.18, stockMinimo: 100 },
  { codigo: 'EMP-BOLSA-PAPEL', nombre: 'Bolsa de papel kraft', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.75, stockMinimo: 100 },
  { codigo: 'EMP-CONTENEDOR', nombre: 'Contenedor para desayuno', tipo: 'EMPAQUE', unidad: 'UND', costo: 2.2, stockMinimo: 50 },
  { codigo: 'EMP-CAJA-PORCION', nombre: 'Caja para porción', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.6, stockMinimo: 40 },
  { codigo: 'EMP-SERVILLETA', nombre: 'Servilleta', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.08, stockMinimo: 500 },
  { codigo: 'EMP-CUBIERTOS', nombre: 'Juego de cubiertos de madera', tipo: 'EMPAQUE', unidad: 'UND', costo: 0.85, stockMinimo: 50 },
  { codigo: 'EMP-BOLSA-DELIVERY', nombre: 'Bolsa sellada para domicilio', tipo: 'EMPAQUE', unidad: 'UND', costo: 1.9, stockMinimo: 40 },

  // Lo que el local gasta sin venderlo.
  { codigo: 'SUM-DETERGENTE', nombre: 'Detergente para loza', tipo: 'SUMINISTRO', unidad: 'ML', costo: 0.0112, stockMinimo: 3000 },
  { codigo: 'SUM-GUANTES', nombre: 'Guantes de nitrilo', tipo: 'SUMINISTRO', unidad: 'UND', costo: 0.625, stockMinimo: 100 },
  { codigo: 'SUM-BOLSA-BASURA', nombre: 'Bolsa para basura', tipo: 'SUMINISTRO', unidad: 'UND', costo: 1.32, stockMinimo: 50 },
  { codigo: 'SUM-PAPEL-COCINA', nombre: 'Papel de cocina', tipo: 'SUMINISTRO', unidad: 'UND', costo: 8.0, stockMinimo: 10 },
];

/**
 * Lo que la cafetería gasta al día sin venderlo, registrado como consumo
 * interno (Inventario → Consumo interno). El servicio solo acepta SUMINISTRO o
 * EMPAQUE. La compra lo cuenta como demanda. `porDia` es la media; la historia
 * lo varía ±20 % y redondea a la unidad.
 */
export const INTERNAL_USE: Record<string, { porDia: number; destino: string; motivo: string }> = {
  'SUM-DETERGENTE': { porDia: 250, destino: 'Barra y cocina', motivo: 'Lavado de tazas, jarras y utensilios del turno' },
  'SUM-GUANTES': { porDia: 4, destino: 'Cocina', motivo: 'Manipulación de alimentos del turno' },
  'SUM-BOLSA-BASURA': { porDia: 2, destino: 'Limpieza', motivo: 'Recolección de desechos del día' },
  'SUM-PAPEL-COCINA': { porDia: 0.4, destino: 'Barra', motivo: 'Limpieza de vaporizador y superficies' },
};
