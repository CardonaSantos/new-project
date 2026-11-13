/**
 * Categories, products and variants for the demo catalog.
 *
 * The catalog is global in this schema (Producto.codigo and VarianteProducto.sku
 * are unique database-wide), so there is one coherent universe here covering
 * all four giros. What makes a branch look like a repostería or a taquería is
 * the menu assigned to it and the prices it carries, not a separate catalog.
 *
 * Products overlap on purpose: an americano is sold in all four branches at
 * four different prices, which is the clearest way to show a central catalog
 * with local pricing.
 */

export type ProductKind = 'PREPARADO' | 'INVENTARIABLE' | 'SERVICIO';

export interface DemoVariant {
  /** Globally unique SKU; also how recipes and prices point at this variant. */
  sku: string;
  nombre: string;
  /** Required for INVENTARIABLE: the stock article sold directly. */
  articulo?: string;
  /** Modifier groups offered on this variant. */
  modificadores?: string[];
}

export interface DemoProduct {
  codigo: string;
  nombre: string;
  descripcion?: string;
  tipo: ProductKind;
  categoria: string;
  variantes: DemoVariant[];
}

export interface DemoCategory {
  codigo: string;
  nombre: string;
  /** Preparation station this category routes to, per branch config. */
  estacion: 'BARRA' | 'COCINA' | 'REPOSTERIA' | 'NINGUNA';
}

export const categories: DemoCategory[] = [
  { codigo: 'CAT-CAFE', nombre: 'Café', estacion: 'BARRA' },
  { codigo: 'CAT-BEBIDAS-FRIAS', nombre: 'Bebidas frías', estacion: 'BARRA' },
  { codigo: 'CAT-INFUSIONES', nombre: 'Infusiones', estacion: 'BARRA' },
  { codigo: 'CAT-EMBOTELLADAS', nombre: 'Bebidas embotelladas', estacion: 'NINGUNA' },
  { codigo: 'CAT-PASTELERIA', nombre: 'Pastelería', estacion: 'REPOSTERIA' },
  { codigo: 'CAT-PANADERIA', nombre: 'Panadería', estacion: 'REPOSTERIA' },
  { codigo: 'CAT-PASTELES-ENTEROS', nombre: 'Pasteles enteros', estacion: 'NINGUNA' },
  { codigo: 'CAT-PLATOS-FUERTES', nombre: 'Platos fuertes', estacion: 'COCINA' },
  { codigo: 'CAT-ENTRADAS', nombre: 'Entradas y ensaladas', estacion: 'COCINA' },
  { codigo: 'CAT-HAMBURGUESAS', nombre: 'Hamburguesas', estacion: 'COCINA' },
  { codigo: 'CAT-ACOMPANAMIENTOS', nombre: 'Acompañamientos', estacion: 'COCINA' },
  { codigo: 'CAT-SERVICIOS', nombre: 'Servicios', estacion: 'NINGUNA' },
];

/**
 * What an option does to the consumption of the line it's attached to.
 *
 * Absent means the option has no inventory effect at all and is created with
 * zero components — a cooking instruction, not a change to what's used. Every
 * effect carries a quantity, RESTAR included: consumption subtracts that
 * amount from what the recipe asked for, clamped at zero.
 */
export interface DemoModifierComponent {
  articulo: string;
  /** In the article's own base unit. */
  cantidad: number;
  efecto: 'SUMAR' | 'RESTAR' | 'SUSTITUIR';
  /** Required by SUSTITUIR, and must differ from `articulo`. */
  sustituye?: string;
}

export interface DemoModifierOption {
  codigo: string;
  nombre: string;
  precio: number;
  componente?: DemoModifierComponent;
}

export interface DemoModifierGroup {
  codigo: string;
  nombre: string;
  minimo: number;
  maximo: number;
  opciones: DemoModifierOption[];
}

/** Shared modifier groups, attached per variant below. */
export const modifierGroups: DemoModifierGroup[] = [
  {
    codigo: 'MOD-LECHE',
    nombre: 'Tipo de leche',
    minimo: 0,
    maximo: 1,
    opciones: [
      // SUSTITUIR drops the component the recipe declares and adds this one, so
      // what lands in inventory is almond milk instead of whole milk.
      { codigo: 'MOD-LECHE-ALMENDRA', nombre: 'Bebida de almendra', precio: 6.0, componente: { articulo: 'ING-LECHE-ALMENDRA', cantidad: 180, efecto: 'SUSTITUIR', sustituye: 'ING-LECHE' } },
      { codigo: 'MOD-LECHE-DESLACT', nombre: 'Leche deslactosada', precio: 4.0, componente: { articulo: 'ING-LECHE-DESLACT', cantidad: 180, efecto: 'SUSTITUIR', sustituye: 'ING-LECHE' } },
    ],
  },
  {
    codigo: 'MOD-CAFE-EXTRA',
    nombre: 'Intensidad',
    minimo: 0,
    maximo: 2,
    opciones: [
      { codigo: 'MOD-SHOT-EXTRA', nombre: 'Shot extra', precio: 7.0, componente: { articulo: 'ING-CAFE-GRANO', cantidad: 18, efecto: 'SUMAR' } },
      { codigo: 'MOD-DESCAFEINADO', nombre: 'Descafeinado', precio: 3.0, componente: { articulo: 'ING-CAFE-DESCAF', cantidad: 18, efecto: 'SUSTITUIR', sustituye: 'ING-CAFE-GRANO' } },
    ],
  },
  {
    codigo: 'MOD-JARABES',
    nombre: 'Jarabes',
    minimo: 0,
    maximo: 2,
    opciones: [
      { codigo: 'MOD-JARABE-VAINILLA', nombre: 'Jarabe de vainilla', precio: 5.0, componente: { articulo: 'PRE-JARABE-VAINILLA', cantidad: 20, efecto: 'SUMAR' } },
      { codigo: 'MOD-JARABE-CARAMELO', nombre: 'Jarabe de caramelo', precio: 5.0, componente: { articulo: 'PRE-JARABE-CARAMELO', cantidad: 20, efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-ENDULZANTE',
    nombre: 'Endulzante',
    minimo: 0,
    maximo: 1,
    opciones: [
      { codigo: 'MOD-SIN-AZUCAR', nombre: 'Sin azúcar', precio: 0, componente: { articulo: 'ING-AZUCAR', cantidad: 8, efecto: 'RESTAR' } },
    ],
  },
  {
    codigo: 'MOD-HAMBURGUESA-EXTRAS',
    nombre: 'Extras',
    minimo: 0,
    maximo: 3,
    opciones: [
      { codigo: 'MOD-EXTRA-QUESO', nombre: 'Queso extra', precio: 8.0, componente: { articulo: 'ING-QUESO-AMARILLO', cantidad: 1, efecto: 'SUMAR' } },
      { codigo: 'MOD-EXTRA-TOCINO', nombre: 'Tocino extra', precio: 12.0, componente: { articulo: 'ING-TOCINO', cantidad: 30, efecto: 'SUMAR' } },
      { codigo: 'MOD-SIN-CEBOLLA', nombre: 'Sin cebolla', precio: 0, componente: { articulo: 'ING-CEBOLLA', cantidad: 20, efecto: 'RESTAR' } },
    ],
  },
  {
    codigo: 'MOD-TERMINO',
    nombre: 'Término de cocción',
    minimo: 1,
    maximo: 1,
    opciones: [
      // Required single pick, and no components: it tells the kitchen how to
      // cook the cut, it doesn't change what the cut consumes.
      { codigo: 'MOD-TERMINO-MEDIO', nombre: 'Término medio', precio: 0 },
      { codigo: 'MOD-TERMINO-TRES-CUARTOS', nombre: 'Tres cuartos', precio: 0 },
      { codigo: 'MOD-TERMINO-BIEN-COCIDO', nombre: 'Bien cocido', precio: 0 },
    ],
  },
];

const cafeMods = ['MOD-LECHE', 'MOD-CAFE-EXTRA', 'MOD-JARABES', 'MOD-ENDULZANTE'];

export const products: DemoProduct[] = [
  // --- Café -------------------------------------------------------------
  {
    codigo: 'PRD-ESPRESSO', nombre: 'Espresso', tipo: 'PREPARADO', categoria: 'CAT-CAFE',
    descripcion: 'Shot de café arábica recién molido.',
    variantes: [
      { sku: 'SKU-ESPRESSO-S', nombre: 'Sencillo', modificadores: ['MOD-CAFE-EXTRA'] },
      { sku: 'SKU-ESPRESSO-D', nombre: 'Doble', modificadores: ['MOD-CAFE-EXTRA'] },
    ],
  },
  {
    codigo: 'PRD-AMERICANO', nombre: 'Americano', tipo: 'PREPARADO', categoria: 'CAT-CAFE',
    variantes: [
      { sku: 'SKU-AMERICANO-12', nombre: '12 oz', modificadores: ['MOD-CAFE-EXTRA', 'MOD-ENDULZANTE'] },
      { sku: 'SKU-AMERICANO-16', nombre: '16 oz', modificadores: ['MOD-CAFE-EXTRA', 'MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'PRD-CAPUCHINO', nombre: 'Capuchino', tipo: 'PREPARADO', categoria: 'CAT-CAFE',
    variantes: [
      { sku: 'SKU-CAPUCHINO-12', nombre: '12 oz', modificadores: cafeMods },
      { sku: 'SKU-CAPUCHINO-16', nombre: '16 oz', modificadores: cafeMods },
    ],
  },
  {
    codigo: 'PRD-LATTE', nombre: 'Latte', tipo: 'PREPARADO', categoria: 'CAT-CAFE',
    variantes: [
      { sku: 'SKU-LATTE-12', nombre: '12 oz', modificadores: cafeMods },
      { sku: 'SKU-LATTE-16', nombre: '16 oz', modificadores: cafeMods },
    ],
  },
  {
    codigo: 'PRD-MOCHA', nombre: 'Mocha', tipo: 'PREPARADO', categoria: 'CAT-CAFE',
    variantes: [
      { sku: 'SKU-MOCHA-12', nombre: '12 oz', modificadores: cafeMods },
      { sku: 'SKU-MOCHA-16', nombre: '16 oz', modificadores: cafeMods },
    ],
  },

  // --- Bebidas frías ----------------------------------------------------
  {
    codigo: 'PRD-FRAPPE-CAFE', nombre: 'Frappé de café', tipo: 'PREPARADO', categoria: 'CAT-BEBIDAS-FRIAS',
    variantes: [
      { sku: 'SKU-FRAPPE-CAFE-16', nombre: '16 oz', modificadores: ['MOD-LECHE', 'MOD-JARABES', 'MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'PRD-REFRESCO-NATURAL', nombre: 'Refresco natural', tipo: 'PREPARADO',
    categoria: 'CAT-BEBIDAS-FRIAS',
    descripcion: 'De jamaica o de horchata, preparados en casa.',
    variantes: [
      { sku: 'SKU-JAMAICA-16', nombre: 'Jamaica 16 oz', modificadores: ['MOD-ENDULZANTE'] },
      { sku: 'SKU-HORCHATA-16', nombre: 'Horchata 16 oz', modificadores: ['MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'PRD-LICUADO', nombre: 'Licuado', tipo: 'PREPARADO', categoria: 'CAT-BEBIDAS-FRIAS',
    variantes: [
      { sku: 'SKU-LICUADO-BANANO', nombre: 'De banano', modificadores: ['MOD-LECHE', 'MOD-ENDULZANTE'] },
      { sku: 'SKU-LICUADO-FRESA', nombre: 'De fresa', modificadores: ['MOD-LECHE', 'MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'PRD-LIMONADA', nombre: 'Limonada natural', tipo: 'PREPARADO', categoria: 'CAT-BEBIDAS-FRIAS',
    variantes: [
      { sku: 'SKU-LIMONADA-16', nombre: '16 oz', modificadores: ['MOD-ENDULZANTE'] },
    ],
  },

  // --- Infusiones -------------------------------------------------------
  {
    codigo: 'PRD-TE-NEGRO', nombre: 'Té negro', tipo: 'PREPARADO', categoria: 'CAT-INFUSIONES',
    variantes: [
      { sku: 'SKU-TE-NEGRO-12', nombre: '12 oz', modificadores: ['MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'PRD-CHOCOLATE-CALIENTE', nombre: 'Chocolate caliente', tipo: 'PREPARADO', categoria: 'CAT-INFUSIONES',
    variantes: [
      { sku: 'SKU-CHOCOLATE-12', nombre: '12 oz', modificadores: ['MOD-LECHE', 'MOD-ENDULZANTE'] },
    ],
  },

  // --- Bebidas embotelladas: venta directa de stock ---------------------
  {
    codigo: 'PRD-AGUA', nombre: 'Agua pura', tipo: 'INVENTARIABLE', categoria: 'CAT-EMBOTELLADAS',
    variantes: [{ sku: 'SKU-AGUA-600', nombre: 'Botella 600 ml', articulo: 'BEB-AGUA-600' }],
  },
  {
    codigo: 'PRD-REFRESCO', nombre: 'Refresco', tipo: 'INVENTARIABLE', categoria: 'CAT-EMBOTELLADAS',
    variantes: [{ sku: 'SKU-REFRESCO-355', nombre: 'Lata 355 ml', articulo: 'BEB-REFRESCO-355' }],
  },
  {
    codigo: 'PRD-JUGO', nombre: 'Jugo natural', tipo: 'INVENTARIABLE', categoria: 'CAT-EMBOTELLADAS',
    variantes: [{ sku: 'SKU-JUGO-500', nombre: 'Botella 500 ml', articulo: 'BEB-JUGO-500' }],
  },
  {
    codigo: 'PRD-CERVEZA', nombre: 'Cerveza nacional', tipo: 'INVENTARIABLE', categoria: 'CAT-EMBOTELLADAS',
    variantes: [{ sku: 'SKU-CERVEZA-355', nombre: 'Botella 355 ml', articulo: 'BEB-CERVEZA-355' }],
  },

  // --- Pastelería por rebanada -----------------------------------------
  {
    codigo: 'PRD-REBANADA-CHOCOLATE', nombre: 'Rebanada de pastel de chocolate', tipo: 'PREPARADO',
    categoria: 'CAT-PASTELERIA',
    variantes: [{ sku: 'SKU-REBANADA-CHOCOLATE', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-REBANADA-FRESA', nombre: 'Rebanada de pastel de fresa', tipo: 'PREPARADO',
    categoria: 'CAT-PASTELERIA',
    variantes: [{ sku: 'SKU-REBANADA-FRESA', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-TRES-LECHES', nombre: 'Pastel de tres leches', tipo: 'PREPARADO',
    categoria: 'CAT-PASTELERIA',
    variantes: [{ sku: 'SKU-TRES-LECHES', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-CHEESECAKE', nombre: 'Cheesecake', tipo: 'PREPARADO', categoria: 'CAT-PASTELERIA',
    variantes: [{ sku: 'SKU-CHEESECAKE', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-BROWNIE', nombre: 'Brownie', tipo: 'PREPARADO', categoria: 'CAT-PASTELERIA',
    variantes: [{ sku: 'SKU-BROWNIE', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-TARTA-FRESA', nombre: 'Tartaleta de fresa', tipo: 'PREPARADO', categoria: 'CAT-PASTELERIA',
    variantes: [{ sku: 'SKU-TARTA-FRESA', nombre: 'Unidad' }],
  },

  // --- Panadería --------------------------------------------------------
  {
    codigo: 'PRD-CROISSANT', nombre: 'Croissant', tipo: 'PREPARADO', categoria: 'CAT-PANADERIA',
    variantes: [
      { sku: 'SKU-CROISSANT', nombre: 'Simple' },
      { sku: 'SKU-CROISSANT-ALMENDRA', nombre: 'De almendra' },
    ],
  },
  {
    codigo: 'PRD-GALLETA', nombre: 'Galleta de chocolate', tipo: 'PREPARADO', categoria: 'CAT-PANADERIA',
    variantes: [{ sku: 'SKU-GALLETA', nombre: 'Unidad' }],
  },
  {
    codigo: 'PRD-CHAMPURRADA', nombre: 'Champurrada', tipo: 'PREPARADO', categoria: 'CAT-PANADERIA',
    variantes: [{ sku: 'SKU-CHAMPURRADA', nombre: 'Unidad' }],
  },

  // --- Pasteles enteros: producidos a stock, venta directa --------------
  {
    codigo: 'PRD-PASTEL-CHOCOLATE', nombre: 'Pastel de chocolate entero', tipo: 'INVENTARIABLE',
    categoria: 'CAT-PASTELES-ENTEROS',
    descripcion: 'Producido por lote y vendido por unidad desde existencias.',
    variantes: [{ sku: 'SKU-PASTEL-CHOCOLATE', nombre: '20 porciones', articulo: 'PT-PASTEL-CHOCOLATE' }],
  },
  {
    codigo: 'PRD-PASTEL-FRESA', nombre: 'Pastel de fresa entero', tipo: 'INVENTARIABLE',
    categoria: 'CAT-PASTELES-ENTEROS',
    variantes: [{ sku: 'SKU-PASTEL-FRESA', nombre: '20 porciones', articulo: 'PT-PASTEL-FRESA' }],
  },

  // --- Platos fuertes ---------------------------------------------------
  {
    codigo: 'PRD-LOMO-PLANCHA', nombre: 'Lomo a la plancha', tipo: 'PREPARADO', categoria: 'CAT-PLATOS-FUERTES',
    variantes: [{ sku: 'SKU-LOMO-PLANCHA', nombre: 'Porción', modificadores: ['MOD-TERMINO'] }],
  },
  {
    codigo: 'PRD-POLLO-PLANCHA', nombre: 'Pollo a la plancha', tipo: 'PREPARADO', categoria: 'CAT-PLATOS-FUERTES',
    variantes: [{ sku: 'SKU-POLLO-PLANCHA', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-PESCADO', nombre: 'Filete de pescado', tipo: 'PREPARADO', categoria: 'CAT-PLATOS-FUERTES',
    variantes: [{ sku: 'SKU-PESCADO', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-CAMARONES', nombre: 'Camarones al ajillo', tipo: 'PREPARADO', categoria: 'CAT-PLATOS-FUERTES',
    variantes: [{ sku: 'SKU-CAMARONES', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-PASTA-BOLOGNESA', nombre: 'Pasta bolognesa', tipo: 'PREPARADO', categoria: 'CAT-PLATOS-FUERTES',
    variantes: [{ sku: 'SKU-PASTA-BOLOGNESA', nombre: 'Porción' }],
  },

  // --- Entradas y ensaladas ---------------------------------------------
  {
    codigo: 'PRD-ENSALADA-CESAR', nombre: 'Ensalada césar', tipo: 'PREPARADO', categoria: 'CAT-ENTRADAS',
    variantes: [
      { sku: 'SKU-CESAR', nombre: 'Clásica' },
      { sku: 'SKU-CESAR-POLLO', nombre: 'Con pollo' },
    ],
  },
  {
    codigo: 'PRD-SOPA-POLLO', nombre: 'Sopa de pollo', tipo: 'PREPARADO', categoria: 'CAT-ENTRADAS',
    variantes: [{ sku: 'SKU-SOPA-POLLO', nombre: 'Tazón' }],
  },

  // --- Hamburguesas -----------------------------------------------------
  {
    codigo: 'PRD-HAMBURGUESA', nombre: 'Hamburguesa', tipo: 'PREPARADO', categoria: 'CAT-HAMBURGUESAS',
    variantes: [
      { sku: 'SKU-HAMBURGUESA-CLASICA', nombre: 'Clásica', modificadores: ['MOD-HAMBURGUESA-EXTRAS'] },
      { sku: 'SKU-HAMBURGUESA-QUESO', nombre: 'Con queso', modificadores: ['MOD-HAMBURGUESA-EXTRAS'] },
      { sku: 'SKU-HAMBURGUESA-DOBLE', nombre: 'Doble carne', modificadores: ['MOD-HAMBURGUESA-EXTRAS'] },
    ],
  },
  {
    codigo: 'PRD-TACOS', nombre: 'Tacos de carne', tipo: 'PREPARADO', categoria: 'CAT-HAMBURGUESAS',
    variantes: [{ sku: 'SKU-TACOS-3', nombre: 'Orden de 3' }],
  },

  // --- Acompañamientos --------------------------------------------------
  {
    codigo: 'PRD-PAPAS', nombre: 'Papas fritas', tipo: 'PREPARADO', categoria: 'CAT-ACOMPANAMIENTOS',
    variantes: [
      { sku: 'SKU-PAPAS-CHICA', nombre: 'Chica' },
      { sku: 'SKU-PAPAS-GRANDE', nombre: 'Grande' },
    ],
  },
  {
    codigo: 'PRD-ARROZ', nombre: 'Arroz blanco', tipo: 'PREPARADO', categoria: 'CAT-ACOMPANAMIENTOS',
    variantes: [{ sku: 'SKU-ARROZ', nombre: 'Porción' }],
  },
  {
    codigo: 'PRD-FRIJOLES', nombre: 'Frijoles volteados', tipo: 'PREPARADO', categoria: 'CAT-ACOMPANAMIENTOS',
    variantes: [{ sku: 'SKU-FRIJOLES', nombre: 'Porción' }],
  },

  // --- Servicios: sin inventario ni receta ------------------------------
  {
    codigo: 'PRD-SERVICIO-DOMICILIO', nombre: 'Servicio a domicilio', tipo: 'SERVICIO',
    categoria: 'CAT-SERVICIOS',
    variantes: [{ sku: 'SKU-SERVICIO-DOMICILIO', nombre: 'Envío' }],
  },
  {
    codigo: 'PRD-DESCORCHE', nombre: 'Descorche', tipo: 'SERVICIO', categoria: 'CAT-SERVICIOS',
    variantes: [{ sku: 'SKU-DESCORCHE', nombre: 'Por botella' }],
  },
];
