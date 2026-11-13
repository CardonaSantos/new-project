/**
 * Packaging rules, suppliers and purchase presentations.
 *
 * Packaging is where the service mode stops being a label and starts costing
 * money: the same cappuccino consumes nothing at a table, a cup, lid and
 * sleeve to go, and on delivery adds one sealed bag — per order, not per item.
 * That distinction is the AlcanceEmpaque enum, and it's worth demonstrating
 * because it's the kind of cost most places never measure.
 *
 * Presentations are the other half of real costing: flour is bought in 25 kg
 * sacks and stocked in grams, so a purchase at Q212 a sack becomes a cost per
 * gram the system derives rather than someone estimating it.
 */

export type ServiceMode = 'MESA' | 'MOSTRADOR' | 'PARA_LLEVAR' | 'DELIVERY';

export interface DemoPackagingRule {
  nombre: string;
  /** ARTICULO applies per line; ORDEN applies once per order. */
  alcance: 'ARTICULO' | 'ORDEN';
  modalidad: ServiceMode;
  /** Variant SKU when scoped to one product; omitted means every line. */
  sku?: string;
  /** Branch code when the rule is local; omitted means every branch. */
  sucursal?: string;
  lineas: { articulo: string; cantidad: number }[];
}

export const packagingRules: DemoPackagingRule[] = [
  // Hot drinks to go: cup, lid, sleeve. Sized per variant.
  { nombre: 'Vaso caliente 12 oz para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-CAPUCHINO-12', lineas: [{ articulo: 'EMP-VASO-12', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }, { articulo: 'EMP-FAJA', cantidad: 1 }] },
  { nombre: 'Vaso caliente 16 oz para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-CAPUCHINO-16', lineas: [{ articulo: 'EMP-VASO-16', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }, { articulo: 'EMP-FAJA', cantidad: 1 }] },
  { nombre: 'Latte 12 oz para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-LATTE-12', lineas: [{ articulo: 'EMP-VASO-12', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }, { articulo: 'EMP-FAJA', cantidad: 1 }] },
  { nombre: 'Latte 16 oz para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-LATTE-16', lineas: [{ articulo: 'EMP-VASO-16', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }, { articulo: 'EMP-FAJA', cantidad: 1 }] },
  { nombre: 'Americano 12 oz para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-AMERICANO-12', lineas: [{ articulo: 'EMP-VASO-12', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }] },
  { nombre: 'Americano 16 oz para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-AMERICANO-16', lineas: [{ articulo: 'EMP-VASO-16', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }] },
  // Cold drinks need a straw instead of a sleeve.
  { nombre: 'Frappé para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-FRAPPE-CAFE-16', lineas: [{ articulo: 'EMP-VASO-FRIO-16', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }, { articulo: 'EMP-POPOTE', cantidad: 1 }] },
  { nombre: 'Limonada para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-LIMONADA-16', lineas: [{ articulo: 'EMP-VASO-FRIO-16', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }, { articulo: 'EMP-POPOTE', cantidad: 1 }] },
  // Pastry: a slice box, a whole-cake box.
  { nombre: 'Rebanada para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-REBANADA-CHOCOLATE', lineas: [{ articulo: 'EMP-CAJA-REBANADA', cantidad: 1 }] },
  { nombre: 'Rebanada de fresa para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-REBANADA-FRESA', lineas: [{ articulo: 'EMP-CAJA-REBANADA', cantidad: 1 }] },
  { nombre: 'Pastel entero', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-PASTEL-CHOCOLATE', lineas: [{ articulo: 'EMP-CAJA-PASTEL', cantidad: 1 }] },
  { nombre: 'Pastel de fresa entero', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-PASTEL-FRESA', lineas: [{ articulo: 'EMP-CAJA-PASTEL', cantidad: 1 }] },
  // Hot food travels in a container with cutlery.
  { nombre: 'Hamburguesa para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-HAMBURGUESA-CLASICA', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }, { articulo: 'EMP-SERVILLETA', cantidad: 2 }] },
  { nombre: 'Hamburguesa con queso para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-HAMBURGUESA-QUESO', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }, { articulo: 'EMP-SERVILLETA', cantidad: 2 }] },
  { nombre: 'Hamburguesa doble para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-HAMBURGUESA-DOBLE', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }, { articulo: 'EMP-SERVILLETA', cantidad: 3 }] },
  { nombre: 'Papas para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-PAPAS-GRANDE', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }] },
  { nombre: 'Plato fuerte para llevar', alcance: 'ARTICULO', modalidad: 'PARA_LLEVAR', sku: 'SKU-LOMO-PLANCHA', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }, { articulo: 'EMP-CUBIERTOS', cantidad: 1 }] },

  // One bag per order, not per item — this is what AlcanceEmpaque.ORDEN means.
  { nombre: 'Bolsa de la orden para llevar', alcance: 'ORDEN', modalidad: 'PARA_LLEVAR', lineas: [{ articulo: 'EMP-BOLSA-PAPEL', cantidad: 1 }] },
  { nombre: 'Empaque sellado de delivery', alcance: 'ORDEN', modalidad: 'DELIVERY', lineas: [{ articulo: 'EMP-BOLSA-DELIVERY', cantidad: 1 }, { articulo: 'EMP-SERVILLETA', cantidad: 3 }] },
  // Delivery reuses the to-go containers on top of the sealed bag.
  { nombre: 'Hamburguesa en delivery', alcance: 'ARTICULO', modalidad: 'DELIVERY', sku: 'SKU-HAMBURGUESA-CLASICA', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }] },
  { nombre: 'Hamburguesa con queso en delivery', alcance: 'ARTICULO', modalidad: 'DELIVERY', sku: 'SKU-HAMBURGUESA-QUESO', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }] },
  { nombre: 'Plato fuerte en delivery', alcance: 'ARTICULO', modalidad: 'DELIVERY', sku: 'SKU-LOMO-PLANCHA', lineas: [{ articulo: 'EMP-CONTENEDOR', cantidad: 1 }, { articulo: 'EMP-CUBIERTOS', cantidad: 1 }] },
  { nombre: 'Capuchino 16 oz en delivery', alcance: 'ARTICULO', modalidad: 'DELIVERY', sku: 'SKU-CAPUCHINO-16', lineas: [{ articulo: 'EMP-VASO-16', cantidad: 1 }, { articulo: 'EMP-TAPA', cantidad: 1 }] },

  // A table service consumes a napkin and nothing else: not zero, but close.
  { nombre: 'Servilleta en mesa', alcance: 'ORDEN', modalidad: 'MESA', lineas: [{ articulo: 'EMP-SERVILLETA', cantidad: 2 }] },
];

export interface DemoSupplier {
  codigo: string;
  nombre: string;
  nit: string;
  contacto: string;
  telefono: string;
  /** Lead time in days, used when scheduling purchase orders. */
  diasEntrega: number;
  /** Article codes this supplier sells, as purchase presentations. */
  presentaciones: DemoPresentation[];
}

export interface DemoPresentation {
  articulo: string;
  nombre: string;
  /**
   * Unit the purchase is expressed in, which is rarely the unit the article is
   * stocked in. Guatemala buys dry goods by the libra and the quintal (100 lb),
   * so flour priced per quintal has to land in the inventory as grams — the
   * conversion the initial seed registers (1 lb = 453.59237 g) is what makes
   * that arithmetic the system's job instead of the buyer's.
   */
  unidadCompra: 'UND' | 'LB' | 'G' | 'ML' | 'L';
  /** Purchase units in one presentation: a quintal is 100, an arroba 25. */
  cantidad: number;
  /** Price for the whole presentation, in GTQ. */
  precio: number;
}

export const suppliers: DemoSupplier[] = [
  {
    codigo: 'PROV-ABARROTES', nombre: 'Distribuidora El Granero', nit: '3456789-1',
    contacto: 'Marta Figueroa', telefono: '2245 7700', diasEntrega: 2,
    presentaciones: [
      // Quintal = 100 lb, arroba = 25 lb: the measures these goods are actually
      // quoted in at La Terminal, not the kilos a European system assumes.
      { articulo: 'ING-HARINA', nombre: 'Quintal de harina de trigo', unidadCompra: 'LB', cantidad: 100, precio: 195 },
      { articulo: 'ING-AZUCAR', nombre: 'Quintal de azúcar estándar', unidadCompra: 'LB', cantidad: 100, precio: 350 },
      { articulo: 'ING-AZUCAR-GLAS', nombre: 'Arroba de azúcar glas', unidadCompra: 'LB', cantidad: 25, precio: 138 },
      { articulo: 'ING-SAL', nombre: 'Arroba de sal', unidadCompra: 'LB', cantidad: 25, precio: 42 },
      { articulo: 'ING-ARROZ', nombre: 'Quintal de arroz', unidadCompra: 'LB', cantidad: 100, precio: 450 },
      { articulo: 'ING-FRIJOL', nombre: 'Quintal de frijol negro', unidadCompra: 'LB', cantidad: 100, precio: 525 },
      { articulo: 'ING-PASTA', nombre: 'Caja de pasta 20 lb', unidadCompra: 'LB', cantidad: 20, precio: 148 },
      { articulo: 'ING-ACEITE', nombre: 'Bidón de aceite 20 L', unidadCompra: 'L', cantidad: 20, precio: 395 },
      { articulo: 'ING-LEVADURA', nombre: 'Bolsa de levadura 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 62 },
      { articulo: 'ING-POLVO-HORNEAR', nombre: 'Bote de polvo para hornear 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 38 },
      { articulo: 'ING-ESPECIAS', nombre: 'Bolsa de especias 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 88 },
      { articulo: 'ING-GELATINA', nombre: 'Bolsa de grenetina 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 168 },
      { articulo: 'ING-JAMAICA', nombre: 'Bolsa de rosa de jamaica 5 lb', unidadCompra: 'LB', cantidad: 5, precio: 190 },
      { articulo: 'ING-CANELA', nombre: 'Bolsa de canela 2 lb', unidadCompra: 'LB', cantidad: 2, precio: 96 },
      { articulo: 'ING-PAN-HAMBURGUESA', nombre: 'Bolsa de pan de hamburguesa 48 und', unidadCompra: 'UND', cantidad: 48, precio: 96 },
      { articulo: 'ING-TORTILLA', nombre: 'Paquete de tortilla 200 und', unidadCompra: 'UND', cantidad: 200, precio: 80 },
    ],
  },
  {
    codigo: 'PROV-LACTEOS', nombre: 'Lácteos del Valle', nit: '4567890-2',
    contacto: 'Julio Recinos', telefono: '2245 7810', diasEntrega: 1,
    presentaciones: [
      { articulo: 'ING-LECHE', nombre: 'Caja de leche 12 L', unidadCompra: 'L', cantidad: 12, precio: 198 },
      { articulo: 'ING-LECHE-DESLACT', nombre: 'Caja de leche deslactosada 12 L', unidadCompra: 'L', cantidad: 12, precio: 246 },
      { articulo: 'ING-CREMA', nombre: 'Caja de crema 6 L', unidadCompra: 'L', cantidad: 6, precio: 258 },
      { articulo: 'ING-LECHE-CONDENSADA', nombre: 'Caja de leche condensada 24 und', unidadCompra: 'UND', cantidad: 24, precio: 312 },
      { articulo: 'ING-LECHE-EVAPORADA', nombre: 'Caja de leche evaporada 24 und', unidadCompra: 'UND', cantidad: 24, precio: 264 },
      { articulo: 'ING-MANTEQUILLA', nombre: 'Caja de mantequilla 20 lb', unidadCompra: 'LB', cantidad: 20, precio: 580 },
      { articulo: 'ING-QUESO-CREMA', nombre: 'Caja de queso crema 12 lb', unidadCompra: 'LB', cantidad: 12, precio: 318 },
      { articulo: 'ING-QUESO-AMARILLO', nombre: 'Caja de queso en rebanadas 200 und', unidadCompra: 'UND', cantidad: 200, precio: 210 },
      { articulo: 'ING-HUEVO', nombre: 'Cartón de huevo 360 und', unidadCompra: 'UND', cantidad: 360, precio: 684 },
    ],
  },
  {
    codigo: 'PROV-CARNES', nombre: 'Carnes y Mariscos Pacífico', nit: '5678901-3',
    contacto: 'Ana Portillo', telefono: '2245 7920', diasEntrega: 2,
    presentaciones: [
      { articulo: 'ING-CARNE-MOLIDA', nombre: 'Caja de carne molida 20 lb', unidadCompra: 'LB', cantidad: 20, precio: 690 },
      { articulo: 'ING-LOMO-RES', nombre: 'Caja de lomo de res 20 lb', unidadCompra: 'LB', cantidad: 20, precio: 980 },
      { articulo: 'ING-POLLO', nombre: 'Caja de pechuga 40 lb', unidadCompra: 'LB', cantidad: 40, precio: 560 },
      { articulo: 'ING-TOCINO', nombre: 'Caja de tocino 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 395 },
      { articulo: 'ING-CAMARON', nombre: 'Caja de camarón 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 760 },
      { articulo: 'ING-PESCADO', nombre: 'Caja de filete de tilapia 12 lb', unidadCompra: 'LB', cantidad: 12, precio: 480 },
    ],
  },
  {
    codigo: 'PROV-VERDURAS', nombre: 'Verduras La Cosecha', nit: '6789012-4',
    contacto: 'Rodrigo Mejía', telefono: '2245 8030', diasEntrega: 1,
    presentaciones: [
      { articulo: 'ING-TOMATE', nombre: 'Caja de tomate 45 lb', unidadCompra: 'LB', cantidad: 45, precio: 225 },
      { articulo: 'ING-CEBOLLA', nombre: 'Costal de cebolla 45 lb', unidadCompra: 'LB', cantidad: 45, precio: 190 },
      { articulo: 'ING-LECHUGA', nombre: 'Caja de lechuga 20 lb', unidadCompra: 'LB', cantidad: 20, precio: 95 },
      { articulo: 'ING-PAPA', nombre: 'Quintal de papa', unidadCompra: 'LB', cantidad: 100, precio: 310 },
      { articulo: 'ING-FRESA', nombre: 'Caja de fresa 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 185 },
      { articulo: 'ING-BANANO', nombre: 'Caja de banano 40 lb', unidadCompra: 'LB', cantidad: 40, precio: 120 },
      { articulo: 'ING-LIMON', nombre: 'Red de limón 100 und', unidadCompra: 'UND', cantidad: 100, precio: 80 },
    ],
  },
  {
    codigo: 'PROV-CAFE', nombre: 'Tostaduría Altiplano', nit: '7890123-5',
    contacto: 'Claudia Barrios', telefono: '2245 8140', diasEntrega: 3,
    presentaciones: [
      { articulo: 'ING-CAFE-GRANO', nombre: 'Saco de café tostado 25 lb', unidadCompra: 'LB', cantidad: 25, precio: 1125 },
      { articulo: 'ING-CAFE-DESCAF', nombre: 'Saco de descafeinado 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 530 },
      { articulo: 'ING-TE-NEGRO', nombre: 'Caja de té negro 5 lb', unidadCompra: 'LB', cantidad: 5, precio: 310 },
      { articulo: 'ING-CHOCOLATE', nombre: 'Caja de cobertura 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 520 },
      { articulo: 'ING-CACAO', nombre: 'Bolsa de cacao 5 lb', unidadCompra: 'LB', cantidad: 5, precio: 215 },
      { articulo: 'ING-VAINILLA', nombre: 'Botella de vainilla 1 L', unidadCompra: 'L', cantidad: 1, precio: 185 },
      { articulo: 'ING-LECHE-ALMENDRA', nombre: 'Caja de bebida de almendra 12 L', unidadCompra: 'L', cantidad: 12, precio: 384 },
    ],
  },
  {
    codigo: 'PROV-EMPAQUES', nombre: 'Empaques y Desechables Norte', nit: '8901234-6',
    contacto: 'Eduardo Pineda', telefono: '2245 8250', diasEntrega: 4,
    presentaciones: [
      { articulo: 'EMP-VASO-12', nombre: 'Paquete de vaso 12 oz 500 und', unidadCompra: 'UND', cantidad: 500, precio: 520 },
      { articulo: 'EMP-VASO-16', nombre: 'Paquete de vaso 16 oz 500 und', unidadCompra: 'UND', cantidad: 500, precio: 615 },
      { articulo: 'EMP-VASO-FRIO-16', nombre: 'Paquete de vaso frío 16 oz 500 und', unidadCompra: 'UND', cantidad: 500, precio: 580 },
      { articulo: 'EMP-TAPA', nombre: 'Paquete de tapas 1000 und', unidadCompra: 'UND', cantidad: 1000, precio: 390 },
      { articulo: 'EMP-FAJA', nombre: 'Paquete de fajas 500 und', unidadCompra: 'UND', cantidad: 500, precio: 130 },
      { articulo: 'EMP-POPOTE', nombre: 'Paquete de popotes 1000 und', unidadCompra: 'UND', cantidad: 1000, precio: 165 },
      { articulo: 'EMP-CAJA-PASTEL', nombre: 'Paquete de cajas de pastel 50 und', unidadCompra: 'UND', cantidad: 50, precio: 215 },
      { articulo: 'EMP-CAJA-REBANADA', nombre: 'Paquete de cajas de rebanada 100 und', unidadCompra: 'UND', cantidad: 100, precio: 180 },
      { articulo: 'EMP-CONTENEDOR', nombre: 'Paquete de contenedores 250 und', unidadCompra: 'UND', cantidad: 250, precio: 560 },
      { articulo: 'EMP-BOLSA-PAPEL', nombre: 'Paquete de bolsas de papel 500 und', unidadCompra: 'UND', cantidad: 500, precio: 395 },
      { articulo: 'EMP-BOLSA-DELIVERY', nombre: 'Paquete de bolsas delivery 250 und', unidadCompra: 'UND', cantidad: 250, precio: 510 },
      { articulo: 'EMP-SERVILLETA', nombre: 'Fardo de servilletas 5000 und', unidadCompra: 'UND', cantidad: 5000, precio: 420 },
      { articulo: 'EMP-CUBIERTOS', nombre: 'Paquete de cubiertos 500 und', unidadCompra: 'UND', cantidad: 500, precio: 440 },
      { articulo: 'SUM-DETERGENTE', nombre: 'Bidón de detergente 20 L', unidadCompra: 'L', cantidad: 20, precio: 225 },
      { articulo: 'SUM-GUANTES', nombre: 'Caja de guantes 200 und', unidadCompra: 'UND', cantidad: 200, precio: 125 },
      { articulo: 'SUM-BOLSA-BASURA', nombre: 'Paquete de bolsas de basura 100 und', unidadCompra: 'UND', cantidad: 100, precio: 132 },
      { articulo: 'SUM-PAPEL-COCINA', nombre: 'Fardo de papel de cocina 12 und', unidadCompra: 'UND', cantidad: 12, precio: 96 },
    ],
  },
  {
    codigo: 'PROV-BEBIDAS', nombre: 'Bebidas Centroamérica', nit: '9012345-7',
    contacto: 'Silvia Ordóñez', telefono: '2245 8360', diasEntrega: 2,
    presentaciones: [
      { articulo: 'BEB-AGUA-600', nombre: 'Caja de agua 24 und', unidadCompra: 'UND', cantidad: 24, precio: 62 },
      { articulo: 'BEB-REFRESCO-355', nombre: 'Caja de gaseosa 24 und', unidadCompra: 'UND', cantidad: 24, precio: 115 },
      { articulo: 'BEB-JUGO-500', nombre: 'Caja de jugo 12 und', unidadCompra: 'UND', cantidad: 12, precio: 84 },
      { articulo: 'BEB-CERVEZA-355', nombre: 'Caja de cerveza 24 und', unidadCompra: 'UND', cantidad: 24, precio: 198 },
      { articulo: 'ING-HIELO', nombre: 'Bolsa de hielo 10 lb', unidadCompra: 'LB', cantidad: 10, precio: 12 },
    ],
  },
];
