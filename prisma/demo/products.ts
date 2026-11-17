/**
 * Catálogo de Café Pepita de Oro: categorías, toppings y productos.
 *
 * Los precios viven en branches.ts (`basePrices`), por variante. Lo que cada
 * variante consume vive en recipes.ts; aquí solo qué se vende y con qué
 * opciones. Un producto INVENTARIABLE se vende tal cual de la vitrina y
 * descuenta su artículo; uno PREPARADO pasa por barra o cocina con su receta.
 */
import type { KitchenUnitCode } from './articles.js';

export type ProductKind = 'PREPARADO' | 'INVENTARIABLE' | 'SERVICIO';

export interface DemoVariant {
  /** SKU único; también es como recetas y precios apuntan a la variante. */
  sku: string;
  nombre: string;
  /** Obligatorio en INVENTARIABLE: el artículo que se vende directo. */
  articulo?: string;
  /** Grupos de toppings ofrecidos en esta variante. */
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
  /** Estación a la que la categoría se rutea en la sucursal. */
  estacion: 'BARRA' | 'COCINA' | 'NINGUNA';
}

export const categories: DemoCategory[] = [
  { codigo: 'CAT-CAFE-CALIENTE', nombre: 'Café caliente', estacion: 'BARRA' },
  { codigo: 'CAT-CAFE-FRIO', nombre: 'Café frío', estacion: 'BARRA' },
  { codigo: 'CAT-SIN-CAFE', nombre: 'Bebidas sin café', estacion: 'BARRA' },
  { codigo: 'CAT-DESAYUNOS', nombre: 'Desayunos', estacion: 'COCINA' },
  { codigo: 'CAT-PANADERIA', nombre: 'Pan y repostería', estacion: 'BARRA' },
  { codigo: 'CAT-EMBOTELLADAS', nombre: 'Bebidas embotelladas', estacion: 'NINGUNA' },
  { codigo: 'CAT-SERVICIOS', nombre: 'Servicios', estacion: 'NINGUNA' },
];

export interface DemoModifierComponent {
  articulo: string;
  /** En la unidad base del artículo, o en `unidad` si se da. */
  cantidad: number;
  unidad?: KitchenUnitCode;
  efecto: 'SUMAR' | 'RESTAR' | 'SUSTITUIR';
  /** Obligatorio en SUSTITUIR, y distinto de `articulo`. */
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

export const modifierGroups: DemoModifierGroup[] = [
  {
    codigo: 'MOD-LECHE',
    nombre: 'Tipo de leche',
    minimo: 0,
    maximo: 1,
    opciones: [
      // SUSTITUIR quita la leche entera de la receta y pone esta en su lugar.
      // La cantidad es una sola para todos los tamaños —el sistema no la
      // escala—, así que va la de un vaso mediano.
      { codigo: 'MOD-LECHE-DESLACT', nombre: 'Leche deslactosada', precio: 0, componente: { articulo: 'LAC-LECHE-DESLACT', cantidad: 240, efecto: 'SUSTITUIR', sustituye: 'LAC-LECHE-ENTERA' } },
      { codigo: 'MOD-LECHE-ALMENDRA', nombre: 'Bebida de almendra', precio: 6, componente: { articulo: 'LAC-BEBIDA-ALMENDRA', cantidad: 240, efecto: 'SUSTITUIR', sustituye: 'LAC-LECHE-ENTERA' } },
      { codigo: 'MOD-LECHE-AVENA', nombre: 'Bebida de avena', precio: 6, componente: { articulo: 'LAC-BEBIDA-AVENA', cantidad: 240, efecto: 'SUSTITUIR', sustituye: 'LAC-LECHE-ENTERA' } },
    ],
  },
  {
    codigo: 'MOD-SHOT',
    nombre: 'Shot extra',
    minimo: 0,
    maximo: 2,
    opciones: [
      { codigo: 'MOD-SHOT-EXTRA', nombre: 'Shot extra de espresso', precio: 6, componente: { articulo: 'CAF-GRANO', cantidad: 9, efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-JARABE',
    nombre: 'Jarabes',
    minimo: 0,
    maximo: 2,
    opciones: [
      { codigo: 'MOD-JARABE-VAINILLA', nombre: 'Vainilla de la casa', precio: 5, componente: { articulo: 'PRE-JARABE-VAINILLA', cantidad: 1, unidad: 'CDA', efecto: 'SUMAR' } },
      { codigo: 'MOD-JARABE-CARAMELO', nombre: 'Caramelo', precio: 5, componente: { articulo: 'SEC-JARABE-CARAMELO', cantidad: 1, unidad: 'CDA', efecto: 'SUMAR' } },
      { codigo: 'MOD-JARABE-AVELLANA', nombre: 'Avellana', precio: 5, componente: { articulo: 'SEC-JARABE-AVELLANA', cantidad: 1, unidad: 'CDA', efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-TOPPING',
    nombre: 'Toppings',
    minimo: 0,
    maximo: 3,
    opciones: [
      { codigo: 'MOD-TOP-CREMA', nombre: 'Crema batida', precio: 5, componente: { articulo: 'LAC-CREMA-BATIR', cantidad: 2, unidad: 'CDA', efecto: 'SUMAR' } },
      { codigo: 'MOD-TOP-CANELA', nombre: 'Canela espolvoreada', precio: 0, componente: { articulo: 'SEC-CANELA-MOLIDA', cantidad: 0.5, efecto: 'SUMAR' } },
      { codigo: 'MOD-TOP-CHISPAS', nombre: 'Chispas de chocolate', precio: 4, componente: { articulo: 'SEC-CHISPAS-CHOCOLATE', cantidad: 10, efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-ENDULZANTE',
    nombre: 'Endulzante',
    minimo: 0,
    maximo: 1,
    opciones: [
      { codigo: 'MOD-END-AZUCAR', nombre: 'Azúcar', precio: 0, componente: { articulo: 'SEC-AZUCAR-SOBRE', cantidad: 2, efecto: 'SUMAR' } },
      { codigo: 'MOD-END-STEVIA', nombre: 'Stevia', precio: 0, componente: { articulo: 'SEC-STEVIA-SOBRE', cantidad: 1, efecto: 'SUMAR' } },
      { codigo: 'MOD-END-MIEL', nombre: 'Miel de abeja', precio: 3, componente: { articulo: 'SEC-MIEL', cantidad: 1, unidad: 'CDA', efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-HUEVOS',
    nombre: 'Huevos al gusto',
    minimo: 1,
    maximo: 1,
    opciones: [
      // Elección obligatoria que le dice a la cocina cómo prepararlos; solo
      // los rancheros cambian lo que se consume.
      { codigo: 'MOD-HUEVOS-REVUELTOS', nombre: 'Revueltos', precio: 0 },
      { codigo: 'MOD-HUEVOS-ESTRELLADOS', nombre: 'Estrellados', precio: 0 },
      { codigo: 'MOD-HUEVOS-RANCHEROS', nombre: 'Rancheros', precio: 0, componente: { articulo: 'VER-TOMATE', cantidad: 60, efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-PAN',
    nombre: 'Pan o tortillas',
    minimo: 1,
    maximo: 1,
    opciones: [
      { codigo: 'MOD-PAN-FRANCES', nombre: 'Pan francés', precio: 0, componente: { articulo: 'PAN-FRANCES', cantidad: 2, efecto: 'SUMAR' } },
      { codigo: 'MOD-PAN-TORTILLAS', nombre: 'Tortillas', precio: 0, componente: { articulo: 'PAN-TORTILLA', cantidad: 3, efecto: 'SUMAR' } },
    ],
  },
  {
    codigo: 'MOD-EXTRAS',
    nombre: 'Extras',
    minimo: 0,
    maximo: 3,
    opciones: [
      { codigo: 'MOD-EXTRA-AGUACATE', nombre: 'Aguacate', precio: 8, componente: { articulo: 'VER-AGUACATE', cantidad: 0.5, efecto: 'SUMAR' } },
      { codigo: 'MOD-EXTRA-TOCINO', nombre: 'Tocino', precio: 10, componente: { articulo: 'CAR-TOCINO', cantidad: 2, efecto: 'SUMAR' } },
      { codigo: 'MOD-EXTRA-QUESO', nombre: 'Queso fresco extra', precio: 6, componente: { articulo: 'LAC-QUESO-FRESCO', cantidad: 40, efecto: 'SUMAR' } },
      { codigo: 'MOD-EXTRA-HUEVO', nombre: 'Huevo extra', precio: 6, componente: { articulo: 'LAC-HUEVO', cantidad: 1, efecto: 'SUMAR' } },
    ],
  },
];

/** Lo que una bebida con leche ofrece. */
const conLeche = ['MOD-LECHE', 'MOD-SHOT', 'MOD-JARABE', 'MOD-TOPPING', 'MOD-ENDULZANTE'];

export const products: DemoProduct[] = [
  // Café caliente
  {
    codigo: 'P-ESPRESSO', nombre: 'Espresso', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    descripcion: 'Café Antigua de tueste espresso, extraído al momento',
    variantes: [
      { sku: 'SKU-ESPRESSO-SENCILLO', nombre: 'Sencillo', modificadores: ['MOD-ENDULZANTE'] },
      { sku: 'SKU-ESPRESSO-DOBLE', nombre: 'Doble', modificadores: ['MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'P-AMERICANO', nombre: 'Americano', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    variantes: [
      { sku: 'SKU-AMERICANO-8', nombre: '8 oz', modificadores: ['MOD-SHOT', 'MOD-ENDULZANTE'] },
      { sku: 'SKU-AMERICANO-12', nombre: '12 oz', modificadores: ['MOD-SHOT', 'MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'P-PICHEL', nombre: 'Café de pichel', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    descripcion: 'Café filtrado de la casa, como se sirve en Antigua',
    variantes: [
      { sku: 'SKU-PICHEL-8', nombre: '8 oz', modificadores: ['MOD-ENDULZANTE'] },
      { sku: 'SKU-PICHEL-12', nombre: '12 oz', modificadores: ['MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'P-CAFE-LECHE', nombre: 'Café con leche', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    variantes: [{ sku: 'SKU-CAFE-LECHE-12', nombre: '12 oz', modificadores: ['MOD-LECHE', 'MOD-ENDULZANTE'] }],
  },
  {
    codigo: 'P-CAPUCHINO', nombre: 'Capuchino', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    variantes: [
      { sku: 'SKU-CAPUCHINO-8', nombre: '8 oz', modificadores: conLeche },
      { sku: 'SKU-CAPUCHINO-12', nombre: '12 oz', modificadores: conLeche },
    ],
  },
  {
    codigo: 'P-LATTE', nombre: 'Latte', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    variantes: [
      { sku: 'SKU-LATTE-12', nombre: '12 oz', modificadores: conLeche },
      { sku: 'SKU-LATTE-16', nombre: '16 oz', modificadores: conLeche },
    ],
  },
  {
    codigo: 'P-MOCHA', nombre: 'Mocha', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    variantes: [
      { sku: 'SKU-MOCHA-12', nombre: '12 oz', modificadores: ['MOD-LECHE', 'MOD-SHOT', 'MOD-TOPPING'] },
      { sku: 'SKU-MOCHA-16', nombre: '16 oz', modificadores: ['MOD-LECHE', 'MOD-SHOT', 'MOD-TOPPING'] },
    ],
  },
  {
    codigo: 'P-BOMBON', nombre: 'Café bombón', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    descripcion: 'Espresso doble sobre leche condensada',
    variantes: [{ sku: 'SKU-BOMBON-8', nombre: '8 oz' }],
  },
  {
    codigo: 'P-CHOCOLATE', nombre: 'Chocolate caliente de tablilla', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    descripcion: 'Chocolate artesanal de tablilla batido con leche',
    variantes: [
      { sku: 'SKU-CHOCOLATE-8', nombre: '8 oz', modificadores: ['MOD-LECHE', 'MOD-TOPPING'] },
      { sku: 'SKU-CHOCOLATE-12', nombre: '12 oz', modificadores: ['MOD-LECHE', 'MOD-TOPPING'] },
    ],
  },
  {
    codigo: 'P-CHAI', nombre: 'Chai latte', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    variantes: [{ sku: 'SKU-CHAI-12', nombre: '12 oz', modificadores: ['MOD-LECHE', 'MOD-ENDULZANTE'] }],
  },
  {
    codigo: 'P-TE', nombre: 'Té o infusión', tipo: 'PREPARADO', categoria: 'CAT-CAFE-CALIENTE',
    descripcion: 'Manzanilla, limón o té negro',
    variantes: [{ sku: 'SKU-TE-12', nombre: '12 oz', modificadores: ['MOD-ENDULZANTE'] }],
  },

  // Café frío
  {
    codigo: 'P-COLD-BREW', nombre: 'Cold brew', tipo: 'PREPARADO', categoria: 'CAT-CAFE-FRIO',
    descripcion: 'Café Antigua infusionado en frío 16 horas',
    variantes: [
      { sku: 'SKU-COLD-BREW-12', nombre: '12 oz', modificadores: ['MOD-JARABE', 'MOD-ENDULZANTE'] },
      { sku: 'SKU-COLD-BREW-16', nombre: '16 oz', modificadores: ['MOD-JARABE', 'MOD-ENDULZANTE'] },
    ],
  },
  {
    codigo: 'P-LATTE-FRIO', nombre: 'Latte frío', tipo: 'PREPARADO', categoria: 'CAT-CAFE-FRIO',
    variantes: [{ sku: 'SKU-LATTE-FRIO-16', nombre: '16 oz', modificadores: ['MOD-LECHE', 'MOD-SHOT', 'MOD-JARABE', 'MOD-ENDULZANTE'] }],
  },
  {
    codigo: 'P-FRAPPE', nombre: 'Frappé de café', tipo: 'PREPARADO', categoria: 'CAT-CAFE-FRIO',
    variantes: [{ sku: 'SKU-FRAPPE-16', nombre: '16 oz', modificadores: ['MOD-LECHE', 'MOD-JARABE', 'MOD-TOPPING'] }],
  },

  // Sin café
  {
    codigo: 'P-LIMONADA', nombre: 'Limonada con hierbabuena', tipo: 'PREPARADO', categoria: 'CAT-SIN-CAFE',
    variantes: [{ sku: 'SKU-LIMONADA-16', nombre: '16 oz' }],
  },
  {
    codigo: 'P-LICUADO', nombre: 'Licuado', tipo: 'PREPARADO', categoria: 'CAT-SIN-CAFE',
    variantes: [
      { sku: 'SKU-LICUADO-BANANO', nombre: 'Banano 16 oz', modificadores: ['MOD-LECHE'] },
      { sku: 'SKU-LICUADO-FRESA', nombre: 'Fresa 16 oz', modificadores: ['MOD-LECHE'] },
    ],
  },
  {
    codigo: 'P-ATOL', nombre: 'Atol de elote', tipo: 'PREPARADO', categoria: 'CAT-SIN-CAFE',
    descripcion: 'Hecho en casa cada mañana, con canela',
    variantes: [{ sku: 'SKU-ATOL-12', nombre: '12 oz', modificadores: ['MOD-TOPPING'] }],
  },

  // Desayunos, todo el día
  {
    codigo: 'P-DESAYUNO-CHAPIN', nombre: 'Desayuno chapín', tipo: 'PREPARADO', categoria: 'CAT-DESAYUNOS',
    descripcion: 'Huevos al gusto, frijoles volteados, plátanos fritos, crema, queso fresco y café de pichel',
    variantes: [{ sku: 'SKU-DESAYUNO-CHAPIN', nombre: 'Plato', modificadores: ['MOD-HUEVOS', 'MOD-PAN', 'MOD-EXTRAS'] }],
  },
  {
    codigo: 'P-PANQUEQUES', nombre: 'Panqueques con miel y fresas', tipo: 'PREPARADO', categoria: 'CAT-DESAYUNOS',
    variantes: [{ sku: 'SKU-PANQUEQUES', nombre: 'Orden de 3', modificadores: ['MOD-EXTRAS'] }],
  },
  {
    codigo: 'P-TOSTADA-AGUACATE', nombre: 'Tostada de aguacate', tipo: 'PREPARADO', categoria: 'CAT-DESAYUNOS',
    descripcion: 'Pan de masa madre, aguacate, tomate y huevo',
    variantes: [{ sku: 'SKU-TOSTADA-AGUACATE', nombre: 'Plato', modificadores: ['MOD-HUEVOS', 'MOD-EXTRAS'] }],
  },
  {
    codigo: 'P-SANDWICH-CROISSANT', nombre: 'Sándwich de jamón y queso en croissant', tipo: 'PREPARADO', categoria: 'CAT-DESAYUNOS',
    variantes: [{ sku: 'SKU-SANDWICH-CROISSANT', nombre: 'Unidad', modificadores: ['MOD-EXTRAS'] }],
  },

  // Vitrina: se vende tal cual y descuenta su artículo.
  {
    codigo: 'P-CROISSANT', nombre: 'Croissant de mantequilla', tipo: 'INVENTARIABLE', categoria: 'CAT-PANADERIA',
    variantes: [{ sku: 'SKU-CROISSANT', nombre: 'Unidad', articulo: 'PAN-CROISSANT' }],
  },
  {
    codigo: 'P-PAN-BANANO', nombre: 'Pan de banano', tipo: 'INVENTARIABLE', categoria: 'CAT-PANADERIA',
    descripcion: 'Horneado en casa',
    variantes: [{ sku: 'SKU-PAN-BANANO', nombre: 'Rebanada', articulo: 'PRE-PAN-BANANO' }],
  },
  {
    codigo: 'P-RELLENITO', nombre: 'Rellenito de plátano', tipo: 'INVENTARIABLE', categoria: 'CAT-PANADERIA',
    descripcion: 'Plátano relleno de frijol con chocolate, hecho en casa',
    variantes: [{ sku: 'SKU-RELLENITO', nombre: 'Unidad', articulo: 'PRE-RELLENITO' }],
  },
  {
    codigo: 'P-CHAMPURRADA', nombre: 'Champurrada', tipo: 'INVENTARIABLE', categoria: 'CAT-PANADERIA',
    variantes: [{ sku: 'SKU-CHAMPURRADA', nombre: 'Unidad', articulo: 'PAN-CHAMPURRADA' }],
  },
  {
    codigo: 'P-CHEESECAKE', nombre: 'Cheesecake de fresa', tipo: 'INVENTARIABLE', categoria: 'CAT-PANADERIA',
    variantes: [{ sku: 'SKU-CHEESECAKE', nombre: 'Porción', articulo: 'POS-CHEESECAKE' }],
  },
  {
    codigo: 'P-TRES-LECHES', nombre: 'Pastel de tres leches', tipo: 'INVENTARIABLE', categoria: 'CAT-PANADERIA',
    variantes: [{ sku: 'SKU-TRES-LECHES', nombre: 'Porción', articulo: 'POS-TRES-LECHES' }],
  },

  // Embotelladas
  {
    codigo: 'P-AGUA-PURA', nombre: 'Agua pura', tipo: 'INVENTARIABLE', categoria: 'CAT-EMBOTELLADAS',
    variantes: [{ sku: 'SKU-AGUA-PURA', nombre: '600 ml', articulo: 'BEB-AGUA-PURA' }],
  },
  {
    codigo: 'P-AGUA-MINERAL', nombre: 'Agua mineral', tipo: 'INVENTARIABLE', categoria: 'CAT-EMBOTELLADAS',
    variantes: [{ sku: 'SKU-AGUA-MINERAL', nombre: '355 ml', articulo: 'BEB-AGUA-MINERAL' }],
  },

  // El cargo de envío: un producto de servicio, sin inventario.
  {
    codigo: 'P-SERVICIO-DOMICILIO', nombre: 'Servicio a domicilio', tipo: 'SERVICIO', categoria: 'CAT-SERVICIOS',
    variantes: [{ sku: 'SKU-SERVICIO-DOMICILIO', nombre: 'Envío en Antigua' }],
  },
];

/** Una sola sucursal: los toppings cobran su precio base, sin excepciones. */
export const modifierBranchPrices: { sucursal: string; opcion: string; importe: number }[] = [];
