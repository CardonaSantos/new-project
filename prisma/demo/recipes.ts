/**
 * Recetas de Café Pepita de Oro.
 *
 * Dos clases, como las separa el sistema:
 *  - de PRODUCCIÓN: un lote que la cocina prepara y que entra al inventario
 *    con su propio lote y vencimiento (jarabes, cold brew, frijol volteado,
 *    atol, pan de banano, rellenitos). Los rellenitos llevan frijol volteado,
 *    así que producirlos consume otra producción: el kardex lo muestra.
 *  - de VENTA: lo que se descuenta al vender una unidad de la variante.
 *
 * Cada medida está escrita como la escribiría quien cocina: el espresso en
 * gramos, el café de pichel en cucharadas de café molido, la leche condensada,
 * los jarabes y la crema en cucharadas, la vainilla en cucharaditas. El agua
 * no se lleva en inventario, como en cualquier cafetería.
 *
 * `merma` es un porcentaje sobre la cantidad: la leche que se pierde al
 * texturizar, el aceite que queda en el sartén.
 */
import type { KitchenUnitCode } from './articles.js';

export interface DemoRecipeComponent {
  articulo: string;
  /** En la unidad base del artículo, o en `unidad` si se da. */
  cantidad: number;
  unidad?: KitchenUnitCode;
  /** Porcentaje, 0–100, sobre `cantidad`. */
  merma?: number;
}

export interface DemoProductionRecipe {
  codigo: string;
  nombre: string;
  /** Artículo que produce el lote. */
  resultado: string;
  /** Cuánto rinde un lote, en la unidad base del resultado. */
  rendimiento: number;
  /** Vida útil del lote, que define el vencimiento. */
  vidaUtilDias?: number;
  componentes: DemoRecipeComponent[];
}

export interface DemoSaleRecipe {
  /** SKU de la variante. */
  sku: string;
  nombre: string;
  componentes: DemoRecipeComponent[];
}

export const productionRecipes: DemoProductionRecipe[] = [
  {
    // Partes iguales de azúcar y agua: un kilo rinde un litro y medio largo.
    codigo: 'REC-JARABE-SIMPLE', nombre: 'Jarabe simple', resultado: 'PRE-JARABE-SIMPLE',
    rendimiento: 1600, vidaUtilDias: 21,
    componentes: [{ articulo: 'SEC-AZUCAR', cantidad: 1000 }],
  },
  {
    codigo: 'REC-JARABE-VAINILLA', nombre: 'Jarabe de vainilla de la casa', resultado: 'PRE-JARABE-VAINILLA',
    rendimiento: 1000, vidaUtilDias: 21,
    componentes: [
      { articulo: 'PRE-JARABE-SIMPLE', cantidad: 970 },
      { articulo: 'SEC-EXTRACTO-VAINILLA', cantidad: 2, unidad: 'CDA' },
    ],
  },
  {
    // 250 g de molienda gruesa en dos litros de agua fría por 16 horas; el
    // café retiene parte del agua, de ahí que rinda 1.75 L de concentrado.
    codigo: 'REC-COLD-BREW', nombre: 'Concentrado de cold brew', resultado: 'PRE-COLD-BREW',
    rendimiento: 1750, vidaUtilDias: 7,
    componentes: [{ articulo: 'CAF-MOLIDO', cantidad: 250 }],
  },
  {
    codigo: 'REC-FRIJOL-VOLTEADO', nombre: 'Frijoles volteados', resultado: 'PRE-FRIJOL-VOLTEADO',
    rendimiento: 1100, vidaUtilDias: 4,
    componentes: [
      { articulo: 'SEC-FRIJOL-NEGRO', cantidad: 500 },
      { articulo: 'VER-CEBOLLA', cantidad: 100 },
      { articulo: 'SEC-ACEITE', cantidad: 4, unidad: 'CDA' },
      { articulo: 'SEC-SAL', cantidad: 8 },
    ],
  },
  {
    // Diez elotes molidos con litro y medio de leche y un litro de agua.
    codigo: 'REC-ATOL-ELOTE', nombre: 'Atol de elote', resultado: 'PRE-ATOL-ELOTE',
    rendimiento: 3000, vidaUtilDias: 1,
    componentes: [
      { articulo: 'VER-ELOTE', cantidad: 10 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 1500 },
      { articulo: 'SEC-AZUCAR', cantidad: 200 },
      { articulo: 'SEC-CANELA-RAJA', cantidad: 2 },
      { articulo: 'SEC-SAL', cantidad: 3 },
    ],
  },
  {
    // Un molde de 23 cm, cortado en diez rebanadas.
    codigo: 'REC-PAN-BANANO', nombre: 'Pan de banano', resultado: 'PRE-PAN-BANANO',
    rendimiento: 10, vidaUtilDias: 4,
    componentes: [
      { articulo: 'SEC-HARINA', cantidad: 250 },
      { articulo: 'VER-BANANO', cantidad: 4 },
      { articulo: 'LAC-HUEVO', cantidad: 2 },
      { articulo: 'SEC-AZUCAR', cantidad: 150 },
      { articulo: 'LAC-MANTEQUILLA', cantidad: 110 },
      { articulo: 'SEC-POLVO-HORNEAR', cantidad: 8 },
      { articulo: 'SEC-EXTRACTO-VAINILLA', cantidad: 1, unidad: 'CDTA' },
      { articulo: 'SEC-SAL', cantidad: 2 },
    ],
  },
  {
    // Masa de plátano cocido, rellena de frijol volteado con chocolate, frita.
    codigo: 'REC-RELLENITO', nombre: 'Rellenitos de plátano', resultado: 'PRE-RELLENITO',
    rendimiento: 12, vidaUtilDias: 2,
    componentes: [
      { articulo: 'VER-PLATANO', cantidad: 6 },
      { articulo: 'PRE-FRIJOL-VOLTEADO', cantidad: 250 },
      { articulo: 'SEC-CHOCOLATE-TABLILLA', cantidad: 1 },
      { articulo: 'SEC-AZUCAR', cantidad: 60 },
      { articulo: 'SEC-CANELA-MOLIDA', cantidad: 3 },
      { articulo: 'SEC-ACEITE', cantidad: 250, merma: 10 },
    ],
  },
];

export const saleRecipes: DemoSaleRecipe[] = [
  // Espresso: siempre en gramos, que es como se dosifica en la barra.
  { sku: 'SKU-ESPRESSO-SENCILLO', nombre: 'Espresso sencillo', componentes: [{ articulo: 'CAF-GRANO', cantidad: 9 }] },
  { sku: 'SKU-ESPRESSO-DOBLE', nombre: 'Espresso doble', componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }] },
  { sku: 'SKU-AMERICANO-8', nombre: 'Americano 8 oz', componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }] },
  { sku: 'SKU-AMERICANO-12', nombre: 'Americano 12 oz', componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }] },

  // De pichel: por cucharadas de café molido, como en casa.
  { sku: 'SKU-PICHEL-8', nombre: 'Café de pichel 8 oz', componentes: [{ articulo: 'CAF-MOLIDO', cantidad: 2, unidad: 'CDA-CAFE' }] },
  { sku: 'SKU-PICHEL-12', nombre: 'Café de pichel 12 oz', componentes: [{ articulo: 'CAF-MOLIDO', cantidad: 3, unidad: 'CDA-CAFE' }] },
  {
    sku: 'SKU-CAFE-LECHE-12', nombre: 'Café con leche 12 oz',
    componentes: [
      { articulo: 'CAF-MOLIDO', cantidad: 2, unidad: 'CDA-CAFE' },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 180 },
    ],
  },

  // Con leche texturizada: la merma es la leche que queda en la jarra.
  {
    sku: 'SKU-CAPUCHINO-8', nombre: 'Capuchino 8 oz',
    componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }, { articulo: 'LAC-LECHE-ENTERA', cantidad: 150, merma: 10 }],
  },
  {
    sku: 'SKU-CAPUCHINO-12', nombre: 'Capuchino 12 oz',
    componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }, { articulo: 'LAC-LECHE-ENTERA', cantidad: 240, merma: 10 }],
  },
  {
    sku: 'SKU-LATTE-12', nombre: 'Latte 12 oz',
    componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }, { articulo: 'LAC-LECHE-ENTERA', cantidad: 280, merma: 8 }],
  },
  {
    sku: 'SKU-LATTE-16', nombre: 'Latte 16 oz',
    componentes: [{ articulo: 'CAF-GRANO', cantidad: 18 }, { articulo: 'LAC-LECHE-ENTERA', cantidad: 380, merma: 8 }],
  },
  {
    sku: 'SKU-MOCHA-12', nombre: 'Mocha 12 oz',
    componentes: [
      { articulo: 'CAF-GRANO', cantidad: 18 },
      { articulo: 'SEC-SALSA-CHOCOLATE', cantidad: 2, unidad: 'CDA' },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 240, merma: 8 },
    ],
  },
  {
    sku: 'SKU-MOCHA-16', nombre: 'Mocha 16 oz',
    componentes: [
      { articulo: 'CAF-GRANO', cantidad: 18 },
      { articulo: 'SEC-SALSA-CHOCOLATE', cantidad: 3, unidad: 'CDA' },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 330, merma: 8 },
    ],
  },
  {
    sku: 'SKU-BOMBON-8', nombre: 'Café bombón',
    componentes: [
      { articulo: 'CAF-GRANO', cantidad: 18 },
      { articulo: 'LAC-LECHE-CONDENSADA', cantidad: 2, unidad: 'CDA' },
    ],
  },
  {
    sku: 'SKU-CHOCOLATE-8', nombre: 'Chocolate de tablilla 8 oz',
    componentes: [
      { articulo: 'SEC-CHOCOLATE-TABLILLA', cantidad: 0.5 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 200 },
      { articulo: 'SEC-AZUCAR', cantidad: 10 },
    ],
  },
  {
    sku: 'SKU-CHOCOLATE-12', nombre: 'Chocolate de tablilla 12 oz',
    componentes: [
      { articulo: 'SEC-CHOCOLATE-TABLILLA', cantidad: 1 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 300 },
      { articulo: 'SEC-AZUCAR', cantidad: 15 },
    ],
  },
  {
    sku: 'SKU-CHAI-12', nombre: 'Chai latte 12 oz',
    componentes: [
      { articulo: 'SEC-CHAI', cantidad: 5, unidad: 'CDA' },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 240, merma: 8 },
    ],
  },
  { sku: 'SKU-TE-12', nombre: 'Té o infusión', componentes: [{ articulo: 'SEC-TE-SOBRE', cantidad: 1 }] },

  // Frías
  {
    sku: 'SKU-COLD-BREW-12', nombre: 'Cold brew 12 oz',
    componentes: [{ articulo: 'PRE-COLD-BREW', cantidad: 120 }, { articulo: 'HIE-HIELO', cantidad: 150 }],
  },
  {
    sku: 'SKU-COLD-BREW-16', nombre: 'Cold brew 16 oz',
    componentes: [{ articulo: 'PRE-COLD-BREW', cantidad: 160 }, { articulo: 'HIE-HIELO', cantidad: 200 }],
  },
  {
    sku: 'SKU-LATTE-FRIO-16', nombre: 'Latte frío 16 oz',
    componentes: [
      { articulo: 'CAF-GRANO', cantidad: 18 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 280 },
      { articulo: 'HIE-HIELO', cantidad: 180 },
    ],
  },
  {
    sku: 'SKU-FRAPPE-16', nombre: 'Frappé de café',
    componentes: [
      { articulo: 'CAF-GRANO', cantidad: 18 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 200 },
      { articulo: 'HIE-HIELO', cantidad: 250 },
      { articulo: 'PRE-JARABE-SIMPLE', cantidad: 3, unidad: 'CDA' },
      { articulo: 'LAC-CREMA-BATIR', cantidad: 2, unidad: 'CDA' },
    ],
  },
  {
    sku: 'SKU-LIMONADA-16', nombre: 'Limonada con hierbabuena',
    componentes: [
      { articulo: 'VER-LIMON', cantidad: 3 },
      { articulo: 'VER-HIERBABUENA', cantidad: 5 },
      { articulo: 'PRE-JARABE-SIMPLE', cantidad: 3, unidad: 'CDA' },
      { articulo: 'HIE-HIELO', cantidad: 200 },
    ],
  },
  {
    sku: 'SKU-LICUADO-BANANO', nombre: 'Licuado de banano',
    componentes: [
      { articulo: 'VER-BANANO', cantidad: 1 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 300 },
      { articulo: 'SEC-AZUCAR', cantidad: 15 },
      { articulo: 'HIE-HIELO', cantidad: 100 },
    ],
  },
  {
    sku: 'SKU-LICUADO-FRESA', nombre: 'Licuado de fresa',
    componentes: [
      { articulo: 'VER-FRESA', cantidad: 120 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 300 },
      { articulo: 'SEC-AZUCAR', cantidad: 20 },
      { articulo: 'HIE-HIELO', cantidad: 100 },
    ],
  },
  { sku: 'SKU-ATOL-12', nombre: 'Atol de elote 12 oz', componentes: [{ articulo: 'PRE-ATOL-ELOTE', cantidad: 360 }] },

  // Desayunos: el pan o las tortillas los pone el topping obligatorio.
  {
    sku: 'SKU-DESAYUNO-CHAPIN', nombre: 'Desayuno chapín',
    componentes: [
      { articulo: 'LAC-HUEVO', cantidad: 2 },
      { articulo: 'PRE-FRIJOL-VOLTEADO', cantidad: 120 },
      { articulo: 'VER-PLATANO', cantidad: 1 },
      { articulo: 'SEC-ACEITE', cantidad: 1, unidad: 'CDA' },
      { articulo: 'LAC-CREMA', cantidad: 2, unidad: 'CDA' },
      { articulo: 'LAC-QUESO-FRESCO', cantidad: 40 },
      // El café de pichel que acompaña al desayuno.
      { articulo: 'CAF-MOLIDO', cantidad: 2, unidad: 'CDA-CAFE' },
    ],
  },
  {
    sku: 'SKU-PANQUEQUES', nombre: 'Panqueques con miel y fresas',
    componentes: [
      { articulo: 'SEC-HARINA', cantidad: 120 },
      { articulo: 'LAC-HUEVO', cantidad: 1 },
      { articulo: 'LAC-LECHE-ENTERA', cantidad: 150 },
      { articulo: 'LAC-MANTEQUILLA', cantidad: 15 },
      { articulo: 'SEC-AZUCAR', cantidad: 10 },
      { articulo: 'SEC-POLVO-HORNEAR', cantidad: 5 },
      { articulo: 'SEC-MIEL', cantidad: 2, unidad: 'CDA' },
      { articulo: 'VER-FRESA', cantidad: 60 },
    ],
  },
  {
    sku: 'SKU-TOSTADA-AGUACATE', nombre: 'Tostada de aguacate',
    componentes: [
      { articulo: 'PAN-MASA-MADRE', cantidad: 2 },
      { articulo: 'VER-AGUACATE', cantidad: 1 },
      { articulo: 'LAC-HUEVO', cantidad: 1 },
      { articulo: 'VER-TOMATE', cantidad: 30 },
      { articulo: 'SEC-ACEITE', cantidad: 1, unidad: 'CDTA' },
      { articulo: 'SEC-SAL', cantidad: 1 },
    ],
  },
  {
    sku: 'SKU-SANDWICH-CROISSANT', nombre: 'Sándwich en croissant',
    componentes: [
      { articulo: 'PAN-CROISSANT', cantidad: 1 },
      { articulo: 'CAR-JAMON', cantidad: 2 },
      { articulo: 'LAC-QUESO-AMARILLO', cantidad: 1 },
      { articulo: 'LAC-MANTEQUILLA', cantidad: 5 },
      { articulo: 'VER-TOMATE', cantidad: 30 },
    ],
  },
];
