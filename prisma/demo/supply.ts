/**
 * Empaque por modalidad, y los proveedores de Café Pepita de Oro con sus
 * presentaciones de compra.
 *
 * El empaque es donde la modalidad cuesta dinero: el mismo capuchino no
 * consume nada en mesa, vaso, tapa y faja para llevar, y en domicilio suma la
 * bolsa sellada, una por orden. El sistema aplica a cada línea la regla más
 * específica —la del producto antes que la general—, así que la general solo
 * pone una servilleta: lo que se lleva cualquier pan de la vitrina.
 *
 * Las presentaciones son la otra mitad del costeo real: el café se compra en
 * bolsas de 5 lb y se lleva en gramos, y el costo por gramo lo calcula el
 * sistema, no quien compra.
 */

export type ServiceMode = 'MESA' | 'MOSTRADOR' | 'PARA_LLEVAR' | 'DELIVERY';

export interface DemoPackagingRule {
  nombre: string;
  /** ARTICULO aplica por línea; ORDEN, una vez por orden. */
  alcance: 'ARTICULO' | 'ORDEN';
  modalidad: ServiceMode;
  /** SKU cuando la regla es de un producto; sin él aplica a toda línea. */
  sku?: string;
  /** Código de sucursal cuando la regla es local; sin él, todas. */
  sucursal?: string;
  lineas: { articulo: string; cantidad: number }[];
}

const cup = (vaso: string, faja = true) => [
  { articulo: vaso, cantidad: 1 },
  { articulo: 'EMP-TAPA', cantidad: 1 },
  ...(faja ? [{ articulo: 'EMP-FAJA', cantidad: 1 }] : []),
];
const cold = [
  { articulo: 'EMP-VASO-FRIO-16', cantidad: 1 },
  { articulo: 'EMP-TAPA', cantidad: 1 },
  { articulo: 'EMP-POPOTE', cantidad: 1 },
];
const plate = [
  { articulo: 'EMP-CONTENEDOR', cantidad: 1 },
  { articulo: 'EMP-CUBIERTOS', cantidad: 1 },
];

/** Qué lleva cada producto cuando sale del local. */
const TO_GO: { etiqueta: string; skus: string[]; lineas: { articulo: string; cantidad: number }[] }[] = [
  { etiqueta: 'Espresso', skus: ['SKU-ESPRESSO-SENCILLO', 'SKU-ESPRESSO-DOBLE'], lineas: cup('EMP-VASO-8', false) },
  {
    etiqueta: 'Caliente 8 oz',
    skus: ['SKU-AMERICANO-8', 'SKU-PICHEL-8', 'SKU-CAPUCHINO-8', 'SKU-BOMBON-8', 'SKU-CHOCOLATE-8'],
    lineas: cup('EMP-VASO-8'),
  },
  {
    etiqueta: 'Caliente 12 oz',
    skus: [
      'SKU-AMERICANO-12', 'SKU-PICHEL-12', 'SKU-CAFE-LECHE-12', 'SKU-CAPUCHINO-12', 'SKU-LATTE-12',
      'SKU-MOCHA-12', 'SKU-CHOCOLATE-12', 'SKU-CHAI-12', 'SKU-TE-12', 'SKU-ATOL-12',
    ],
    lineas: cup('EMP-VASO-12'),
  },
  { etiqueta: 'Caliente 16 oz', skus: ['SKU-LATTE-16', 'SKU-MOCHA-16'], lineas: cup('EMP-VASO-16') },
  {
    etiqueta: 'Fría',
    skus: [
      'SKU-COLD-BREW-12', 'SKU-COLD-BREW-16', 'SKU-LATTE-FRIO-16', 'SKU-FRAPPE-16',
      'SKU-LIMONADA-16', 'SKU-LICUADO-BANANO', 'SKU-LICUADO-FRESA',
    ],
    lineas: cold,
  },
  { etiqueta: 'Plato', skus: ['SKU-DESAYUNO-CHAPIN', 'SKU-PANQUEQUES', 'SKU-TOSTADA-AGUACATE'], lineas: plate },
  { etiqueta: 'Sándwich', skus: ['SKU-SANDWICH-CROISSANT'], lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }] },
  { etiqueta: 'Porción', skus: ['SKU-CHEESECAKE', 'SKU-TRES-LECHES'], lineas: [{ articulo: 'EMP-CAJA-PORCION', cantidad: 1 }, { articulo: 'EMP-CUBIERTOS', cantidad: 1 }] },
];

const MODE_LABEL = { PARA_LLEVAR: 'para llevar', DELIVERY: 'a domicilio' } as const;

export const packagingRules: DemoPackagingRule[] = [
  ...(['PARA_LLEVAR', 'DELIVERY'] as const).flatMap((modalidad) => [
    // La general: solo lo que se lleva un pan de la vitrina.
    {
      nombre: `Servilleta ${MODE_LABEL[modalidad]}`,
      alcance: 'ARTICULO' as const,
      modalidad,
      lineas: [{ articulo: 'EMP-SERVILLETA', cantidad: 1 }],
    },
    ...TO_GO.flatMap((group) =>
      group.skus.map((sku) => ({
        nombre: `${group.etiqueta} ${MODE_LABEL[modalidad]}: ${sku.replace('SKU-', '').toLowerCase()}`,
        alcance: 'ARTICULO' as const,
        modalidad,
        sku,
        lineas: group.lineas,
      })),
    ),
  ]),
  // Una bolsa por orden, no por producto: eso es AlcanceEmpaque.ORDEN.
  { nombre: 'Bolsa de la orden para llevar', alcance: 'ORDEN', modalidad: 'PARA_LLEVAR', lineas: [{ articulo: 'EMP-BOLSA-PAPEL', cantidad: 1 }] },
  {
    nombre: 'Bolsa sellada de domicilio',
    alcance: 'ORDEN',
    modalidad: 'DELIVERY',
    lineas: [{ articulo: 'EMP-BOLSA-DELIVERY', cantidad: 1 }, { articulo: 'EMP-SERVILLETA', cantidad: 2 }],
  },
  { nombre: 'Servilletas en mesa', alcance: 'ORDEN', modalidad: 'MESA', lineas: [{ articulo: 'EMP-SERVILLETA', cantidad: 2 }] },
];

export interface DemoSupplier {
  codigo: string;
  nombre: string;
  nit: string;
  contacto: string;
  telefono: string;
  /** Días de entrega, para programar las órdenes de compra. */
  diasEntrega: number;
  presentaciones: DemoPresentation[];
}

export interface DemoPresentation {
  articulo: string;
  nombre: string;
  /**
   * Unidad en que se compra, que casi nunca es la de la existencia: el café y
   * el azúcar se compran por libra, la leche por litro. La conversión que
   * registra la semilla inicial (1 lb = 453.59237 g) es la que hace esa
   * aritmética trabajo del sistema y no del comprador.
   */
  unidadCompra: 'UND' | 'LB' | 'G' | 'ML' | 'L';
  /** Unidades de compra en una presentación. */
  cantidad: number;
  /** Precio de la presentación completa, en GTQ. */
  precio: number;
}

export const suppliers: DemoSupplier[] = [
  {
    codigo: 'PROV-TOSTADURIA', nombre: 'Tostaduría San Cristóbal', nit: '4486120-6',
    contacto: 'Rodrigo Quiñónez', telefono: '7831 2290', diasEntrega: 2,
    presentaciones: [
      { articulo: 'CAF-GRANO', nombre: 'Café en grano espresso, bolsa 5 lb', unidadCompra: 'LB', cantidad: 5, precio: 440 },
      { articulo: 'CAF-MOLIDO', nombre: 'Café molido tueste medio, bolsa 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 160 },
    ],
  },
  {
    codigo: 'PROV-LACTEOS', nombre: 'Lácteos y Embutidos Santa Isabel', nit: '7208893-1',
    contacto: 'Mirna Cojulún', telefono: '7832 6614', diasEntrega: 1,
    presentaciones: [
      { articulo: 'LAC-LECHE-ENTERA', nombre: 'Leche entera, caja 12 L', unidadCompra: 'L', cantidad: 12, precio: 150 },
      { articulo: 'LAC-LECHE-DESLACT', nombre: 'Leche deslactosada, caja 12 L', unidadCompra: 'L', cantidad: 12, precio: 174 },
      { articulo: 'LAC-BEBIDA-ALMENDRA', nombre: 'Bebida de almendra, caja 6 × 946 ml', unidadCompra: 'ML', cantidad: 5676, precio: 182 },
      { articulo: 'LAC-BEBIDA-AVENA', nombre: 'Bebida de avena, caja 6 × 946 ml', unidadCompra: 'ML', cantidad: 5676, precio: 193 },
      { articulo: 'LAC-CREMA-BATIR', nombre: 'Crema para batir 1 L', unidadCompra: 'L', cantidad: 1, precio: 45 },
      { articulo: 'LAC-CREMA', nombre: 'Crema fresca 1 L', unidadCompra: 'L', cantidad: 1, precio: 30 },
      { articulo: 'LAC-LECHE-CONDENSADA', nombre: 'Leche condensada, lata 300 ml', unidadCompra: 'ML', cantidad: 300, precio: 13 },
      { articulo: 'LAC-QUESO-FRESCO', nombre: 'Queso fresco 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 64 },
      { articulo: 'LAC-QUESO-AMARILLO', nombre: 'Queso amarillo, paquete 24 rebanadas', unidadCompra: 'UND', cantidad: 24, precio: 52 },
      { articulo: 'LAC-MANTEQUILLA', nombre: 'Mantequilla sin sal 1 lb', unidadCompra: 'LB', cantidad: 1, precio: 28 },
      { articulo: 'LAC-HUEVO', nombre: 'Cartón de 30 huevos', unidadCompra: 'UND', cantidad: 30, precio: 39 },
      { articulo: 'CAR-JAMON', nombre: 'Jamón de pavo, paquete 20 rebanadas', unidadCompra: 'UND', cantidad: 20, precio: 50 },
      { articulo: 'CAR-TOCINO', nombre: 'Tocino ahumado, paquete 24 tiras', unidadCompra: 'UND', cantidad: 24, precio: 60 },
    ],
  },
  {
    codigo: 'PROV-ABARROTES', nombre: 'Distribuidora La Antigüeña', nit: '5913346-5',
    contacto: 'Edgar Pocón', telefono: '7832 1187', diasEntrega: 2,
    presentaciones: [
      { articulo: 'SEC-AZUCAR', nombre: 'Azúcar blanca, fardo 25 lb', unidadCompra: 'LB', cantidad: 25, precio: 119 },
      { articulo: 'SEC-AZUCAR-SOBRE', nombre: 'Sobres de azúcar, caja 500', unidadCompra: 'UND', cantidad: 500, precio: 38 },
      { articulo: 'SEC-STEVIA-SOBRE', nombre: 'Sobres de stevia, caja 100', unidadCompra: 'UND', cantidad: 100, precio: 35 },
      { articulo: 'SEC-CANELA-RAJA', nombre: 'Canela en raja, bolsa 50', unidadCompra: 'UND', cantidad: 50, precio: 27.5 },
      { articulo: 'SEC-CANELA-MOLIDA', nombre: 'Canela molida 250 g', unidadCompra: 'G', cantidad: 250, precio: 60 },
      { articulo: 'SEC-CHOCOLATE-TABLILLA', nombre: 'Chocolate de tablilla, paquete 12', unidadCompra: 'UND', cantidad: 12, precio: 42 },
      { articulo: 'SEC-SALSA-CHOCOLATE', nombre: 'Salsa de chocolate 1.9 L', unidadCompra: 'ML', cantidad: 1900, precio: 115 },
      { articulo: 'SEC-JARABE-CARAMELO', nombre: 'Jarabe de caramelo 750 ml', unidadCompra: 'ML', cantidad: 750, precio: 64 },
      { articulo: 'SEC-JARABE-AVELLANA', nombre: 'Jarabe de avellana 750 ml', unidadCompra: 'ML', cantidad: 750, precio: 64 },
      { articulo: 'SEC-EXTRACTO-VAINILLA', nombre: 'Extracto de vainilla 500 ml', unidadCompra: 'ML', cantidad: 500, precio: 70 },
      { articulo: 'SEC-CHAI', nombre: 'Concentrado de chai 946 ml', unidadCompra: 'ML', cantidad: 946, precio: 85 },
      { articulo: 'SEC-TE-SOBRE', nombre: 'Té surtido, caja 100 sobres', unidadCompra: 'UND', cantidad: 100, precio: 120 },
      { articulo: 'SEC-MIEL', nombre: 'Miel de abeja 1 L', unidadCompra: 'L', cantidad: 1, precio: 80 },
      { articulo: 'SEC-HARINA', nombre: 'Harina de trigo, fardo 25 lb', unidadCompra: 'LB', cantidad: 25, precio: 95 },
      { articulo: 'SEC-POLVO-HORNEAR', nombre: 'Polvo de hornear 450 g', unidadCompra: 'G', cantidad: 450, precio: 25 },
      { articulo: 'SEC-FRIJOL-NEGRO', nombre: 'Frijol negro, arroba 25 lb', unidadCompra: 'LB', cantidad: 25, precio: 140 },
      { articulo: 'SEC-ACEITE', nombre: 'Aceite vegetal, galón 3.785 L', unidadCompra: 'ML', cantidad: 3785, precio: 90 },
      { articulo: 'SEC-SAL', nombre: 'Sal 1 kg', unidadCompra: 'G', cantidad: 1000, precio: 5 },
      { articulo: 'SEC-CHISPAS-CHOCOLATE', nombre: 'Chispas de chocolate 1 kg', unidadCompra: 'G', cantidad: 1000, precio: 80 },
    ],
  },
  {
    codigo: 'PROV-MERCADO', nombre: 'Verduras Doña Tere, Mercado de Antigua', nit: '3907761-6',
    contacto: 'Teresa Batz', telefono: '5590 3321', diasEntrega: 1,
    presentaciones: [
      { articulo: 'VER-PLATANO', nombre: 'Mano de plátano maduro (10)', unidadCompra: 'UND', cantidad: 10, precio: 20 },
      { articulo: 'VER-BANANO', nombre: 'Mano de banano (25)', unidadCompra: 'UND', cantidad: 25, precio: 15 },
      { articulo: 'VER-AGUACATE', nombre: 'Red de aguacate Hass (10)', unidadCompra: 'UND', cantidad: 10, precio: 50 },
      { articulo: 'VER-FRESA', nombre: 'Fresa 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 28 },
      { articulo: 'VER-LIMON', nombre: 'Ciento de limón criollo', unidadCompra: 'UND', cantidad: 100, precio: 50 },
      { articulo: 'VER-HIERBABUENA', nombre: 'Manojo de hierbabuena 100 g', unidadCompra: 'G', cantidad: 100, precio: 6 },
      { articulo: 'VER-TOMATE', nombre: 'Tomate 5 lb', unidadCompra: 'LB', cantidad: 5, precio: 25 },
      { articulo: 'VER-CEBOLLA', nombre: 'Cebolla blanca 5 lb', unidadCompra: 'LB', cantidad: 5, precio: 20 },
      { articulo: 'VER-ELOTE', nombre: 'Docena de elote tierno', unidadCompra: 'UND', cantidad: 12, precio: 30 },
    ],
  },
  {
    codigo: 'PROV-PANADERIA', nombre: 'Panadería La Espiga', nit: '6403398-8',
    contacto: 'Julio Sagastume', telefono: '7832 9045', diasEntrega: 1,
    presentaciones: [
      { articulo: 'PAN-FRANCES', nombre: 'Pan francés (50)', unidadCompra: 'UND', cantidad: 50, precio: 50 },
      { articulo: 'PAN-CROISSANT', nombre: 'Croissant de mantequilla (12)', unidadCompra: 'UND', cantidad: 12, precio: 78 },
      { articulo: 'PAN-CHAMPURRADA', nombre: 'Champurradas (50)', unidadCompra: 'UND', cantidad: 50, precio: 75 },
      { articulo: 'PAN-MASA-MADRE', nombre: 'Hogaza de masa madre (20 rebanadas)', unidadCompra: 'UND', cantidad: 20, precio: 50 },
      { articulo: 'PAN-TORTILLA', nombre: 'Tortillas de maíz (50)', unidadCompra: 'UND', cantidad: 50, precio: 25 },
    ],
  },
  {
    codigo: 'PROV-REPOSTERIA', nombre: 'Repostería Las Delicias', nit: '2768815-1',
    contacto: 'Claudia Lemus', telefono: '7832 5508', diasEntrega: 2,
    presentaciones: [
      { articulo: 'POS-CHEESECAKE', nombre: 'Cheesecake de fresa (8 porciones)', unidadCompra: 'UND', cantidad: 8, precio: 128 },
      { articulo: 'POS-TRES-LECHES', nombre: 'Pastel de tres leches (10 porciones)', unidadCompra: 'UND', cantidad: 10, precio: 140 },
    ],
  },
  {
    codigo: 'PROV-BEBIDAS', nombre: 'Distribuidora de Bebidas Sacatepéquez', nit: '9031127-2',
    contacto: 'Byron Tecún', telefono: '7831 4470', diasEntrega: 2,
    presentaciones: [
      { articulo: 'BEB-AGUA-PURA', nombre: 'Agua pura 600 ml, fardo 24', unidadCompra: 'UND', cantidad: 24, precio: 72 },
      { articulo: 'BEB-AGUA-MINERAL', nombre: 'Agua mineral 355 ml, caja 24', unidadCompra: 'UND', cantidad: 24, precio: 192 },
      { articulo: 'HIE-HIELO', nombre: 'Hielo en cubos, bolsa 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 16 },
    ],
  },
  {
    codigo: 'PROV-EMPAQUES', nombre: 'Empaques Desechables del Valle', nit: '8320077-0',
    contacto: 'Silvia Barrios', telefono: '2440 7731', diasEntrega: 3,
    presentaciones: [
      { articulo: 'EMP-VASO-8', nombre: 'Vasos calientes 8 oz (50)', unidadCompra: 'UND', cantidad: 50, precio: 42.5 },
      { articulo: 'EMP-VASO-12', nombre: 'Vasos calientes 12 oz (50)', unidadCompra: 'UND', cantidad: 50, precio: 49 },
      { articulo: 'EMP-VASO-16', nombre: 'Vasos calientes 16 oz (50)', unidadCompra: 'UND', cantidad: 50, precio: 55 },
      { articulo: 'EMP-VASO-FRIO-16', nombre: 'Vasos fríos 16 oz (50)', unidadCompra: 'UND', cantidad: 50, precio: 55 },
      { articulo: 'EMP-TAPA', nombre: 'Tapas para vaso (100)', unidadCompra: 'UND', cantidad: 100, precio: 35 },
      { articulo: 'EMP-FAJA', nombre: 'Fajas de cartón (100)', unidadCompra: 'UND', cantidad: 100, precio: 25 },
      { articulo: 'EMP-POPOTE', nombre: 'Popotes de papel (100)', unidadCompra: 'UND', cantidad: 100, precio: 18 },
      { articulo: 'EMP-BOLSA-PAPEL', nombre: 'Bolsas de papel kraft (100)', unidadCompra: 'UND', cantidad: 100, precio: 75 },
      { articulo: 'EMP-CONTENEDOR', nombre: 'Contenedores para desayuno (50)', unidadCompra: 'UND', cantidad: 50, precio: 110 },
      { articulo: 'EMP-CAJA-PORCION', nombre: 'Cajas para porción (50)', unidadCompra: 'UND', cantidad: 50, precio: 80 },
      { articulo: 'EMP-SERVILLETA', nombre: 'Servilletas (500)', unidadCompra: 'UND', cantidad: 500, precio: 40 },
      { articulo: 'EMP-CUBIERTOS', nombre: 'Cubiertos de madera (50 juegos)', unidadCompra: 'UND', cantidad: 50, precio: 42.5 },
      { articulo: 'EMP-BOLSA-DELIVERY', nombre: 'Bolsas selladas para domicilio (50)', unidadCompra: 'UND', cantidad: 50, precio: 95 },
      { articulo: 'SUM-DETERGENTE', nombre: 'Detergente para loza, galón', unidadCompra: 'ML', cantidad: 3785, precio: 42 },
      { articulo: 'SUM-GUANTES', nombre: 'Guantes de nitrilo, caja 100', unidadCompra: 'UND', cantidad: 100, precio: 62.5 },
      { articulo: 'SUM-BOLSA-BASURA', nombre: 'Bolsas para basura, paquete 25', unidadCompra: 'UND', cantidad: 25, precio: 33 },
      { articulo: 'SUM-PAPEL-COCINA', nombre: 'Papel de cocina, fardo 6 rollos', unidadCompra: 'UND', cantidad: 6, precio: 48 },
    ],
  },
];
