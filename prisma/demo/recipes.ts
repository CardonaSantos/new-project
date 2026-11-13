/**
 * Recipes for the demo, in both flavours the schema supports.
 *
 * PRODUCCION recipes turn ingredients into a stocked article — a batch of
 * puff pastry, a jug of vanilla syrup, a whole cake. VENTA recipes belong to
 * a sellable variant and are what the kitchen consumes when an order is sent.
 *
 * Chaining the two is the point: "Rebanada de pastel de chocolate" consumes
 * PRE-BIZCOCHO-CHOCOLATE and PRE-GANACHE, which are themselves produced from
 * flour, eggs and cream. That two-level bill of materials is what lets the
 * demo answer "what does this slice really cost me" with a number the system
 * computed rather than one somebody typed.
 *
 * `merma` is the share lost to trimming, evaporation or handling, expressed as
 * a percentage of the component. Quantities are in each article's base unit.
 */

export interface DemoRecipeComponent {
  articulo: string;
  cantidad: number;
  /** Percentage, 0–100. Applied on top of `cantidad` when costing. */
  merma?: number;
}

export interface DemoProductionRecipe {
  codigo: string;
  nombre: string;
  /** Article this batch produces. */
  resultado: string;
  /** How much of the result article one batch yields, in its base unit. */
  rendimiento: number;
  /** Shelf life of the batch, which is what drives expiry on the lot. */
  vidaUtilDias?: number;
  componentes: DemoRecipeComponent[];
}

export interface DemoSaleRecipe {
  /** Variant SKU this recipe belongs to. */
  sku: string;
  nombre: string;
  componentes: DemoRecipeComponent[];
}

export const productionRecipes: DemoProductionRecipe[] = [
  {
    codigo: 'REC-MASA-HOJALDRE', nombre: 'Masa de hojaldre', resultado: 'PRE-MASA-HOJALDRE',
    rendimiento: 1700, vidaUtilDias: 3,
    componentes: [
      { articulo: 'ING-HARINA', cantidad: 1000 },
      { articulo: 'ING-MANTEQUILLA', cantidad: 700, merma: 2 },
      { articulo: 'ING-SAL', cantidad: 20 },
    ],
  },
  {
    codigo: 'REC-BIZCOCHO-VAINILLA', nombre: 'Bizcocho de vainilla', resultado: 'PRE-BIZCOCHO-VAINILLA',
    rendimiento: 1800, vidaUtilDias: 4,
    componentes: [
      { articulo: 'ING-HARINA', cantidad: 500 },
      { articulo: 'ING-AZUCAR', cantidad: 400 },
      { articulo: 'ING-HUEVO', cantidad: 8 },
      { articulo: 'ING-MANTEQUILLA', cantidad: 250 },
      { articulo: 'ING-LECHE', cantidad: 200 },
      { articulo: 'ING-POLVO-HORNEAR', cantidad: 15 },
      { articulo: 'ING-VAINILLA', cantidad: 10 },
    ],
  },
  {
    codigo: 'REC-BIZCOCHO-CHOCOLATE', nombre: 'Bizcocho de chocolate', resultado: 'PRE-BIZCOCHO-CHOCOLATE',
    rendimiento: 1900, vidaUtilDias: 4,
    componentes: [
      { articulo: 'ING-HARINA', cantidad: 450 },
      { articulo: 'ING-AZUCAR', cantidad: 420 },
      { articulo: 'ING-CACAO', cantidad: 90 },
      { articulo: 'ING-HUEVO', cantidad: 8 },
      { articulo: 'ING-MANTEQUILLA', cantidad: 250 },
      { articulo: 'ING-LECHE', cantidad: 220 },
      { articulo: 'ING-POLVO-HORNEAR', cantidad: 15 },
    ],
  },
  {
    codigo: 'REC-CREMA-PASTELERA', nombre: 'Crema pastelera', resultado: 'PRE-CREMA-PASTELERA',
    rendimiento: 1250, vidaUtilDias: 2,
    componentes: [
      { articulo: 'ING-LECHE', cantidad: 1000, merma: 4 },
      { articulo: 'ING-AZUCAR', cantidad: 220 },
      { articulo: 'ING-HUEVO', cantidad: 6 },
      { articulo: 'ING-HARINA', cantidad: 80 },
      { articulo: 'ING-VAINILLA', cantidad: 8 },
    ],
  },
  {
    codigo: 'REC-GANACHE', nombre: 'Ganache de chocolate', resultado: 'PRE-GANACHE',
    rendimiento: 1100, vidaUtilDias: 5,
    componentes: [
      { articulo: 'ING-CHOCOLATE', cantidad: 600 },
      { articulo: 'ING-CREMA', cantidad: 500, merma: 2 },
    ],
  },
  {
    codigo: 'REC-BETUN-QUESO', nombre: 'Betún de queso crema', resultado: 'PRE-BETUN-QUESO',
    rendimiento: 1600, vidaUtilDias: 4,
    componentes: [
      { articulo: 'ING-QUESO-CREMA', cantidad: 800 },
      { articulo: 'ING-MANTEQUILLA', cantidad: 300 },
      { articulo: 'ING-AZUCAR-GLAS', cantidad: 500 },
      { articulo: 'ING-VAINILLA', cantidad: 10 },
    ],
  },
  {
    codigo: 'REC-JARABE-VAINILLA', nombre: 'Jarabe de vainilla', resultado: 'PRE-JARABE-VAINILLA',
    rendimiento: 1500, vidaUtilDias: 30,
    componentes: [
      { articulo: 'ING-AZUCAR', cantidad: 1000 },
      { articulo: 'ING-VAINILLA', cantidad: 60 },
    ],
  },
  {
    codigo: 'REC-JARABE-CARAMELO', nombre: 'Jarabe de caramelo', resultado: 'PRE-JARABE-CARAMELO',
    rendimiento: 1400, vidaUtilDias: 30,
    componentes: [
      { articulo: 'ING-AZUCAR', cantidad: 1000, merma: 6 },
      { articulo: 'ING-CREMA', cantidad: 120 },
    ],
  },
  {
    codigo: 'REC-SALSA-TOMATE', nombre: 'Salsa de tomate de la casa', resultado: 'PRE-SALSA-TOMATE',
    rendimiento: 2800, vidaUtilDias: 5,
    componentes: [
      { articulo: 'ING-TOMATE', cantidad: 3000, merma: 8 },
      { articulo: 'ING-CEBOLLA', cantidad: 400, merma: 10 },
      { articulo: 'ING-ACEITE', cantidad: 120 },
      { articulo: 'ING-SAL', cantidad: 30 },
      { articulo: 'ING-ESPECIAS', cantidad: 25 },
    ],
  },
  {
    codigo: 'REC-SALSA-BBQ', nombre: 'Salsa BBQ de la casa', resultado: 'PRE-SALSA-BBQ',
    rendimiento: 1800, vidaUtilDias: 14,
    componentes: [
      { articulo: 'ING-TOMATE', cantidad: 1500, merma: 8 },
      { articulo: 'ING-AZUCAR', cantidad: 400 },
      { articulo: 'ING-ESPECIAS', cantidad: 60 },
      { articulo: 'ING-ACEITE', cantidad: 80 },
    ],
  },
  {
    codigo: 'REC-ADEREZO-CESAR', nombre: 'Aderezo césar', resultado: 'PRE-ADEREZO-CESAR',
    rendimiento: 1100, vidaUtilDias: 4,
    componentes: [
      { articulo: 'ING-ACEITE', cantidad: 800 },
      { articulo: 'ING-HUEVO', cantidad: 4 },
      { articulo: 'ING-LIMON', cantidad: 6, merma: 15 },
      { articulo: 'ING-ESPECIAS', cantidad: 20 },
      { articulo: 'ING-SAL', cantidad: 12 },
    ],
  },
  {
    codigo: 'REC-CALDO-POLLO', nombre: 'Caldo de pollo concentrado', resultado: 'PRE-CALDO-POLLO',
    rendimiento: 4000, vidaUtilDias: 3,
    componentes: [
      { articulo: 'ING-POLLO', cantidad: 1500, merma: 12 },
      { articulo: 'ING-CEBOLLA', cantidad: 300, merma: 10 },
      { articulo: 'ING-SAL', cantidad: 40 },
      { articulo: 'ING-ESPECIAS', cantidad: 30 },
    ],
  },
  // Whole cakes are produced into stock and then sold as INVENTARIABLE units,
  // which is the other half of the story: not everything is assembled on order.
  {
    codigo: 'REC-PASTEL-CHOCOLATE', nombre: 'Pastel de chocolate entero', resultado: 'PT-PASTEL-CHOCOLATE',
    rendimiento: 1, vidaUtilDias: 3,
    componentes: [
      { articulo: 'PRE-BIZCOCHO-CHOCOLATE', cantidad: 1200, merma: 5 },
      { articulo: 'PRE-GANACHE', cantidad: 600 },
      { articulo: 'ING-AZUCAR-GLAS', cantidad: 50 },
    ],
  },
  {
    codigo: 'REC-PASTEL-FRESA', nombre: 'Pastel de fresa entero', resultado: 'PT-PASTEL-FRESA',
    rendimiento: 1, vidaUtilDias: 2,
    componentes: [
      { articulo: 'PRE-BIZCOCHO-VAINILLA', cantidad: 1200, merma: 5 },
      { articulo: 'PRE-CREMA-PASTELERA', cantidad: 500 },
      { articulo: 'ING-FRESA', cantidad: 400, merma: 12 },
      { articulo: 'ING-AZUCAR-GLAS', cantidad: 40 },
    ],
  },
];

export const saleRecipes: DemoSaleRecipe[] = [
  // --- Café -------------------------------------------------------------
  { sku: 'SKU-ESPRESSO-S', nombre: 'Espresso sencillo', componentes: [{ articulo: 'ING-CAFE-GRANO', cantidad: 18 }] },
  { sku: 'SKU-ESPRESSO-D', nombre: 'Espresso doble', componentes: [{ articulo: 'ING-CAFE-GRANO', cantidad: 36 }] },
  {
    sku: 'SKU-AMERICANO-12', nombre: 'Americano 12 oz',
    componentes: [{ articulo: 'ING-CAFE-GRANO', cantidad: 18 }, { articulo: 'ING-AZUCAR', cantidad: 8 }],
  },
  {
    sku: 'SKU-AMERICANO-16', nombre: 'Americano 16 oz',
    componentes: [{ articulo: 'ING-CAFE-GRANO', cantidad: 24 }, { articulo: 'ING-AZUCAR', cantidad: 8 }],
  },
  {
    sku: 'SKU-CAPUCHINO-12', nombre: 'Capuchino 12 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 18 },
      { articulo: 'ING-LECHE', cantidad: 180, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 8 },
    ],
  },
  {
    sku: 'SKU-CAPUCHINO-16', nombre: 'Capuchino 16 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 24 },
      { articulo: 'ING-LECHE', cantidad: 260, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 8 },
    ],
  },
  {
    sku: 'SKU-LATTE-12', nombre: 'Latte 12 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 18 },
      { articulo: 'ING-LECHE', cantidad: 240, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 8 },
    ],
  },
  {
    sku: 'SKU-LATTE-16', nombre: 'Latte 16 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 24 },
      { articulo: 'ING-LECHE', cantidad: 320, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 8 },
    ],
  },
  {
    sku: 'SKU-MOCHA-12', nombre: 'Mocha 12 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 18 },
      { articulo: 'ING-LECHE', cantidad: 200, merma: 5 },
      { articulo: 'PRE-GANACHE', cantidad: 40 },
      { articulo: 'ING-AZUCAR', cantidad: 8 },
    ],
  },
  {
    sku: 'SKU-MOCHA-16', nombre: 'Mocha 16 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 24 },
      { articulo: 'ING-LECHE', cantidad: 280, merma: 5 },
      { articulo: 'PRE-GANACHE', cantidad: 55 },
      { articulo: 'ING-AZUCAR', cantidad: 8 },
    ],
  },

  // --- Bebidas frías ----------------------------------------------------
  {
    sku: 'SKU-FRAPPE-CAFE-16', nombre: 'Frappé de café 16 oz',
    componentes: [
      { articulo: 'ING-CAFE-GRANO', cantidad: 24 },
      { articulo: 'ING-LECHE', cantidad: 200 },
      { articulo: 'ING-HIELO', cantidad: 250 },
      { articulo: 'ING-AZUCAR', cantidad: 20 },
      { articulo: 'ING-CREMA', cantidad: 40 },
    ],
  },
  {
    sku: 'SKU-MATCHA-12', nombre: 'Matcha latte 12 oz',
    componentes: [
      { articulo: 'ING-MATCHA', cantidad: 6 },
      { articulo: 'ING-LECHE', cantidad: 240, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 10 },
    ],
  },
  {
    sku: 'SKU-MATCHA-16', nombre: 'Matcha latte 16 oz',
    componentes: [
      { articulo: 'ING-MATCHA', cantidad: 8 },
      { articulo: 'ING-LECHE', cantidad: 320, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 10 },
    ],
  },
  {
    sku: 'SKU-LIMONADA-16', nombre: 'Limonada natural 16 oz',
    componentes: [
      { articulo: 'ING-LIMON', cantidad: 3, merma: 20 },
      { articulo: 'ING-AZUCAR', cantidad: 30 },
      { articulo: 'ING-HIELO', cantidad: 200 },
    ],
  },

  // --- Infusiones -------------------------------------------------------
  {
    sku: 'SKU-TE-NEGRO-12', nombre: 'Té negro 12 oz',
    componentes: [{ articulo: 'ING-TE-NEGRO', cantidad: 5 }, { articulo: 'ING-AZUCAR', cantidad: 8 }],
  },
  {
    sku: 'SKU-CHOCOLATE-12', nombre: 'Chocolate caliente 12 oz',
    componentes: [
      { articulo: 'ING-CHOCOLATE', cantidad: 35 },
      { articulo: 'ING-LECHE', cantidad: 260, merma: 5 },
      { articulo: 'ING-AZUCAR', cantidad: 10 },
    ],
  },

  // --- Pastelería: consume lo producido por lote ------------------------
  {
    sku: 'SKU-REBANADA-CHOCOLATE', nombre: 'Rebanada de pastel de chocolate',
    componentes: [
      { articulo: 'PRE-BIZCOCHO-CHOCOLATE', cantidad: 110 },
      { articulo: 'PRE-GANACHE', cantidad: 45 },
    ],
  },
  {
    sku: 'SKU-REBANADA-FRESA', nombre: 'Rebanada de pastel de fresa',
    componentes: [
      { articulo: 'PRE-BIZCOCHO-VAINILLA', cantidad: 110 },
      { articulo: 'PRE-CREMA-PASTELERA', cantidad: 50 },
      { articulo: 'ING-FRESA', cantidad: 35, merma: 12 },
    ],
  },
  {
    sku: 'SKU-CHEESECAKE', nombre: 'Cheesecake',
    componentes: [
      { articulo: 'ING-QUESO-CREMA', cantidad: 120 },
      { articulo: 'ING-AZUCAR', cantidad: 45 },
      { articulo: 'ING-HUEVO', cantidad: 1 },
      { articulo: 'ING-GELATINA', cantidad: 4 },
      { articulo: 'PRE-MASA-HOJALDRE', cantidad: 60 },
    ],
  },
  {
    sku: 'SKU-BROWNIE', nombre: 'Brownie',
    componentes: [
      { articulo: 'PRE-BIZCOCHO-CHOCOLATE', cantidad: 95 },
      { articulo: 'ING-CHOCOLATE', cantidad: 20 },
    ],
  },
  {
    sku: 'SKU-TARTA-FRESA', nombre: 'Tartaleta de fresa',
    componentes: [
      { articulo: 'PRE-MASA-HOJALDRE', cantidad: 80 },
      { articulo: 'PRE-CREMA-PASTELERA', cantidad: 60 },
      { articulo: 'ING-FRESA', cantidad: 50, merma: 12 },
    ],
  },

  // --- Panadería --------------------------------------------------------
  { sku: 'SKU-CROISSANT', nombre: 'Croissant', componentes: [{ articulo: 'PRE-MASA-HOJALDRE', cantidad: 85 }] },
  {
    sku: 'SKU-CROISSANT-ALMENDRA', nombre: 'Croissant de almendra',
    componentes: [
      { articulo: 'PRE-MASA-HOJALDRE', cantidad: 85 },
      { articulo: 'PRE-CREMA-PASTELERA', cantidad: 40 },
      { articulo: 'ING-AZUCAR-GLAS', cantidad: 10 },
    ],
  },
  {
    sku: 'SKU-GALLETA', nombre: 'Galleta de chocolate',
    componentes: [
      { articulo: 'ING-HARINA', cantidad: 45 },
      { articulo: 'ING-MANTEQUILLA', cantidad: 25 },
      { articulo: 'ING-AZUCAR', cantidad: 30 },
      { articulo: 'ING-CHOCOLATE', cantidad: 20 },
      { articulo: 'ING-HUEVO', cantidad: 0.25 },
    ],
  },

  // --- Platos fuertes ---------------------------------------------------
  {
    sku: 'SKU-LOMO-PLANCHA', nombre: 'Lomo a la plancha',
    componentes: [
      { articulo: 'ING-LOMO-RES', cantidad: 250, merma: 10 },
      { articulo: 'ING-ACEITE', cantidad: 15 },
      { articulo: 'ING-ESPECIAS', cantidad: 6 },
      { articulo: 'ING-SAL', cantidad: 4 },
    ],
  },
  {
    sku: 'SKU-POLLO-PLANCHA', nombre: 'Pollo a la plancha',
    componentes: [
      { articulo: 'ING-POLLO', cantidad: 240, merma: 8 },
      { articulo: 'ING-ACEITE', cantidad: 15 },
      { articulo: 'ING-ESPECIAS', cantidad: 6 },
    ],
  },
  {
    sku: 'SKU-PESCADO', nombre: 'Filete de pescado',
    componentes: [
      { articulo: 'ING-PESCADO', cantidad: 220, merma: 10 },
      { articulo: 'ING-LIMON', cantidad: 1, merma: 15 },
      { articulo: 'ING-ACEITE', cantidad: 15 },
    ],
  },
  {
    sku: 'SKU-CAMARONES', nombre: 'Camarones al ajillo',
    componentes: [
      { articulo: 'ING-CAMARON', cantidad: 180, merma: 12 },
      { articulo: 'ING-ACEITE', cantidad: 25 },
      { articulo: 'ING-ESPECIAS', cantidad: 8 },
    ],
  },
  {
    sku: 'SKU-PASTA-BOLOGNESA', nombre: 'Pasta bolognesa',
    componentes: [
      { articulo: 'ING-PASTA', cantidad: 140 },
      { articulo: 'ING-CARNE-MOLIDA', cantidad: 130 },
      { articulo: 'PRE-SALSA-TOMATE', cantidad: 160 },
    ],
  },

  // --- Entradas ---------------------------------------------------------
  {
    sku: 'SKU-CESAR', nombre: 'Ensalada césar clásica',
    componentes: [
      { articulo: 'ING-LECHUGA', cantidad: 160, merma: 15 },
      { articulo: 'PRE-ADEREZO-CESAR', cantidad: 45 },
      { articulo: 'PRE-MASA-HOJALDRE', cantidad: 25 },
    ],
  },
  {
    sku: 'SKU-CESAR-POLLO', nombre: 'Ensalada césar con pollo',
    componentes: [
      { articulo: 'ING-LECHUGA', cantidad: 160, merma: 15 },
      { articulo: 'PRE-ADEREZO-CESAR', cantidad: 45 },
      { articulo: 'ING-POLLO', cantidad: 120, merma: 8 },
      { articulo: 'PRE-MASA-HOJALDRE', cantidad: 25 },
    ],
  },
  {
    sku: 'SKU-SOPA-POLLO', nombre: 'Sopa de pollo',
    componentes: [
      { articulo: 'PRE-CALDO-POLLO', cantidad: 350 },
      { articulo: 'ING-POLLO', cantidad: 80, merma: 8 },
      { articulo: 'ING-ARROZ', cantidad: 40 },
    ],
  },

  // --- Hamburguesas y tacos ---------------------------------------------
  {
    sku: 'SKU-HAMBURGUESA-CLASICA', nombre: 'Hamburguesa clásica',
    componentes: [
      { articulo: 'ING-PAN-HAMBURGUESA', cantidad: 1 },
      { articulo: 'ING-CARNE-MOLIDA', cantidad: 150, merma: 12 },
      { articulo: 'ING-LECHUGA', cantidad: 25 },
      { articulo: 'ING-TOMATE', cantidad: 30 },
      { articulo: 'ING-CEBOLLA', cantidad: 20 },
    ],
  },
  {
    sku: 'SKU-HAMBURGUESA-QUESO', nombre: 'Hamburguesa con queso',
    componentes: [
      { articulo: 'ING-PAN-HAMBURGUESA', cantidad: 1 },
      { articulo: 'ING-CARNE-MOLIDA', cantidad: 150, merma: 12 },
      { articulo: 'ING-QUESO-AMARILLO', cantidad: 1 },
      { articulo: 'ING-LECHUGA', cantidad: 25 },
      { articulo: 'ING-TOMATE', cantidad: 30 },
      { articulo: 'ING-CEBOLLA', cantidad: 20 },
    ],
  },
  {
    sku: 'SKU-HAMBURGUESA-DOBLE', nombre: 'Hamburguesa doble carne',
    componentes: [
      { articulo: 'ING-PAN-HAMBURGUESA', cantidad: 1 },
      { articulo: 'ING-CARNE-MOLIDA', cantidad: 300, merma: 12 },
      { articulo: 'ING-QUESO-AMARILLO', cantidad: 2 },
      { articulo: 'ING-TOCINO', cantidad: 30 },
      { articulo: 'ING-LECHUGA', cantidad: 25 },
      { articulo: 'ING-TOMATE', cantidad: 30 },
      { articulo: 'ING-CEBOLLA', cantidad: 20 },
    ],
  },
  {
    sku: 'SKU-TACOS-3', nombre: 'Orden de 3 tacos',
    componentes: [
      { articulo: 'ING-TORTILLA', cantidad: 3 },
      { articulo: 'ING-CARNE-MOLIDA', cantidad: 180, merma: 12 },
      { articulo: 'ING-CEBOLLA', cantidad: 30 },
      { articulo: 'PRE-SALSA-TOMATE', cantidad: 60 },
    ],
  },

  // --- Acompañamientos --------------------------------------------------
  {
    sku: 'SKU-PAPAS-CHICA', nombre: 'Papas fritas chicas',
    componentes: [{ articulo: 'ING-PAPA', cantidad: 150, merma: 18 }, { articulo: 'ING-ACEITE', cantidad: 25 }, { articulo: 'ING-SAL', cantidad: 3 }],
  },
  {
    sku: 'SKU-PAPAS-GRANDE', nombre: 'Papas fritas grandes',
    componentes: [{ articulo: 'ING-PAPA', cantidad: 260, merma: 18 }, { articulo: 'ING-ACEITE', cantidad: 40 }, { articulo: 'ING-SAL', cantidad: 5 }],
  },
  {
    sku: 'SKU-ARROZ', nombre: 'Arroz blanco',
    componentes: [{ articulo: 'ING-ARROZ', cantidad: 90 }, { articulo: 'ING-ACEITE', cantidad: 8 }, { articulo: 'ING-SAL', cantidad: 3 }],
  },
  {
    sku: 'SKU-FRIJOLES', nombre: 'Frijoles volteados',
    componentes: [{ articulo: 'ING-FRIJOL', cantidad: 110 }, { articulo: 'ING-ACEITE', cantidad: 12 }, { articulo: 'ING-CEBOLLA', cantidad: 15 }],
  },
];
