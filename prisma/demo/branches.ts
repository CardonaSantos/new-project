/**
 * The four demo branches, each a complete business rather than a showcase for
 * one feature. Every branch gets rooms and tables, several preparation
 * stations with category routes, registers, a delivery channel, QR ordering
 * and its own prices — the giro changes the emphasis, not the scope.
 *
 * `enfoque` is only documentation: it's what a salesperson leads with when
 * switching to that branch.
 */

export interface DemoStation {
  nombre: string;
  /** Categories routed here. A category not routed anywhere falls back. */
  categorias: string[];
}

export interface DemoRoom {
  nombre: string;
  /** Table numbers; capacity is assigned round-robin from `capacidades`. */
  mesas: string[];
  capacidades: number[];
}

export interface DemoBranch {
  codigo: string;
  nombre: string;
  enfoque: string;
  direccion: string;
  telefono: string;
  /** Multiplier over the catalog's reference price, per branch positioning. */
  factorPrecio: number;
  /** Tickets per day, before the weekday/hour pattern is applied. */
  ticketsDia: number;
  estaciones: DemoStation[];
  salas: DemoRoom[];
  cajas: string[];
  /** Menus assigned to this branch, by menu code. */
  menus: string[];
  /** Share of orders by service mode; must add up to 1. */
  modalidades: { MESA: number; MOSTRADOR: number; PARA_LLEVAR: number; DELIVERY: number };
}

export const branches: DemoBranch[] = [
  {
    codigo: 'REPOSTERIA',
    nombre: 'Repostería Santa Lucía',
    enfoque: 'Producción por lotes, control de caducidad y costo real del producto terminado.',
    direccion: '4a Avenida 12-45, Zona 1',
    telefono: '2234 1100',
    factorPrecio: 1.0,
    ticketsDia: 28,
    estaciones: [
      { nombre: 'Repostería', categorias: ['CAT-PASTELERIA', 'CAT-PANADERIA'] },
      { nombre: 'Barra', categorias: ['CAT-CAFE', 'CAT-BEBIDAS-FRIAS', 'CAT-INFUSIONES'] },
    ],
    salas: [
      { nombre: 'Salón', mesas: ['1', '2', '3', '4', '5', '6'], capacidades: [2, 4] },
      { nombre: 'Terraza', mesas: ['T1', 'T2', 'T3'], capacidades: [2, 4, 6] },
    ],
    cajas: ['CAJA-1'],
    menus: ['MENU-REPOSTERIA'],
    modalidades: { MESA: 0.3, MOSTRADOR: 0.34, PARA_LLEVAR: 0.26, DELIVERY: 0.1 },
  },
  {
    codigo: 'CAFETERIA',
    nombre: 'Café Altura',
    enfoque: 'Modificadores que mueven inventario, variantes por tamaño y empaque para llevar.',
    direccion: 'Boulevard Los Próceres 18-20, Zona 10',
    telefono: '2234 1200',
    factorPrecio: 1.15,
    ticketsDia: 34,
    estaciones: [
      { nombre: 'Barra', categorias: ['CAT-CAFE', 'CAT-BEBIDAS-FRIAS', 'CAT-INFUSIONES'] },
      { nombre: 'Cocina fría', categorias: ['CAT-PASTELERIA', 'CAT-PANADERIA', 'CAT-ENTRADAS'] },
    ],
    salas: [
      { nombre: 'Salón principal', mesas: ['1', '2', '3', '4', '5', '6', '7', '8'], capacidades: [2, 2, 4] },
      { nombre: 'Mezzanine', mesas: ['M1', 'M2', 'M3', 'M4'], capacidades: [4, 6] },
    ],
    cajas: ['CAJA-1', 'CAJA-2'],
    menus: ['MENU-CAFETERIA'],
    modalidades: { MESA: 0.34, MOSTRADOR: 0.3, PARA_LLEVAR: 0.24, DELIVERY: 0.12 },
  },
  {
    codigo: 'RESTAURANTE',
    nombre: 'Restaurante La Ceiba',
    enfoque: 'Servicio en mesa, varias estaciones en paralelo, reservas y cuentas divididas.',
    direccion: '14 Calle 3-18, Zona 14',
    telefono: '2234 1300',
    factorPrecio: 1.3,
    ticketsDia: 30,
    estaciones: [
      { nombre: 'Cocina caliente', categorias: ['CAT-PLATOS-FUERTES', 'CAT-ACOMPANAMIENTOS'] },
      { nombre: 'Cocina fría', categorias: ['CAT-ENTRADAS', 'CAT-PASTELERIA'] },
      { nombre: 'Barra', categorias: ['CAT-CAFE', 'CAT-BEBIDAS-FRIAS', 'CAT-INFUSIONES'] },
    ],
    salas: [
      { nombre: 'Salón principal', mesas: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], capacidades: [2, 4, 4, 6] },
      { nombre: 'Jardín', mesas: ['J1', 'J2', 'J3', 'J4', 'J5'], capacidades: [4, 6, 8] },
      { nombre: 'Privado', mesas: ['P1'], capacidades: [12] },
    ],
    cajas: ['CAJA-1', 'CAJA-2'],
    menus: ['MENU-RESTAURANTE'],
    modalidades: { MESA: 0.62, MOSTRADOR: 0.08, PARA_LLEVAR: 0.14, DELIVERY: 0.16 },
  },
  {
    codigo: 'RAPIDA',
    nombre: 'Burger Punto',
    enfoque: 'Mostrador de alto giro, combos y plataformas de delivery.',
    direccion: 'Calzada Roosevelt 22-10, Zona 7',
    telefono: '2234 1400',
    factorPrecio: 0.92,
    ticketsDia: 35,
    estaciones: [
      { nombre: 'Parrilla', categorias: ['CAT-HAMBURGUESAS'] },
      { nombre: 'Freidora', categorias: ['CAT-ACOMPANAMIENTOS'] },
      // Drinks and desserts share a line at a counter this size, and every
      // category the menu offers has to route somewhere: with three stations
      // there is no single-station fallback to catch an unrouted one.
      { nombre: 'Bebidas y postres', categorias: ['CAT-CAFE', 'CAT-BEBIDAS-FRIAS', 'CAT-INFUSIONES', 'CAT-PASTELERIA', 'CAT-PANADERIA'] },
    ],
    salas: [
      { nombre: 'Comedor', mesas: ['1', '2', '3', '4', '5', '6'], capacidades: [2, 4] },
    ],
    cajas: ['CAJA-1', 'CAJA-2'],
    menus: ['MENU-RAPIDA'],
    modalidades: { MESA: 0.18, MOSTRADOR: 0.4, PARA_LLEVAR: 0.18, DELIVERY: 0.24 },
  },
];

/**
 * Menus per branch. A section groups variants the way the printed card does;
 * only what's listed here is sellable at that branch, which is how one global
 * catalog turns into four different-looking businesses.
 */
export interface DemoMenu {
  codigo: string;
  nombre: string;
  secciones: { nombre: string; skus: string[] }[];
}

const cafeSkus = [
  'SKU-ESPRESSO-S', 'SKU-ESPRESSO-D', 'SKU-AMERICANO-12', 'SKU-AMERICANO-16',
  'SKU-CAPUCHINO-12', 'SKU-CAPUCHINO-16', 'SKU-LATTE-12', 'SKU-LATTE-16',
  'SKU-MOCHA-12', 'SKU-MOCHA-16',
];
const embotelladas = ['SKU-AGUA-600', 'SKU-REFRESCO-355', 'SKU-JUGO-500'];

export const menus: DemoMenu[] = [
  {
    codigo: 'MENU-REPOSTERIA', nombre: 'Carta Repostería Santa Lucía',
    secciones: [
      { nombre: 'Pastelería', skus: ['SKU-REBANADA-CHOCOLATE', 'SKU-REBANADA-FRESA', 'SKU-CHEESECAKE', 'SKU-BROWNIE', 'SKU-TARTA-FRESA'] },
      { nombre: 'Panadería', skus: ['SKU-CROISSANT', 'SKU-CROISSANT-ALMENDRA', 'SKU-GALLETA'] },
      { nombre: 'Pasteles enteros', skus: ['SKU-PASTEL-CHOCOLATE', 'SKU-PASTEL-FRESA'] },
      { nombre: 'Café', skus: cafeSkus },
      { nombre: 'Para acompañar', skus: [...embotelladas, 'SKU-CHOCOLATE-12', 'SKU-TE-NEGRO-12'] },
      { nombre: 'Servicios', skus: ['SKU-SERVICIO-DOMICILIO'] },
    ],
  },
  {
    codigo: 'MENU-CAFETERIA', nombre: 'Carta Café Altura',
    secciones: [
      { nombre: 'Café caliente', skus: cafeSkus },
      { nombre: 'Bebidas frías', skus: ['SKU-FRAPPE-CAFE-16', 'SKU-MATCHA-12', 'SKU-MATCHA-16', 'SKU-LIMONADA-16'] },
      { nombre: 'Infusiones', skus: ['SKU-TE-NEGRO-12', 'SKU-CHOCOLATE-12'] },
      { nombre: 'Repostería', skus: ['SKU-REBANADA-CHOCOLATE', 'SKU-CHEESECAKE', 'SKU-BROWNIE', 'SKU-CROISSANT', 'SKU-CROISSANT-ALMENDRA', 'SKU-GALLETA'] },
      { nombre: 'Ensaladas', skus: ['SKU-CESAR', 'SKU-CESAR-POLLO'] },
      { nombre: 'Embotelladas', skus: embotelladas },
      { nombre: 'Servicios', skus: ['SKU-SERVICIO-DOMICILIO'] },
    ],
  },
  {
    codigo: 'MENU-RESTAURANTE', nombre: 'Carta Restaurante La Ceiba',
    secciones: [
      { nombre: 'Entradas', skus: ['SKU-CESAR', 'SKU-CESAR-POLLO', 'SKU-SOPA-POLLO'] },
      { nombre: 'Platos fuertes', skus: ['SKU-LOMO-PLANCHA', 'SKU-POLLO-PLANCHA', 'SKU-PESCADO', 'SKU-CAMARONES', 'SKU-PASTA-BOLOGNESA'] },
      { nombre: 'Acompañamientos', skus: ['SKU-ARROZ', 'SKU-FRIJOLES', 'SKU-PAPAS-CHICA', 'SKU-PAPAS-GRANDE'] },
      { nombre: 'Postres', skus: ['SKU-REBANADA-CHOCOLATE', 'SKU-REBANADA-FRESA', 'SKU-CHEESECAKE'] },
      { nombre: 'Bebidas', skus: [...cafeSkus, 'SKU-LIMONADA-16', 'SKU-TE-NEGRO-12'] },
      { nombre: 'Embotelladas', skus: [...embotelladas, 'SKU-CERVEZA-355'] },
      { nombre: 'Servicios', skus: ['SKU-SERVICIO-DOMICILIO', 'SKU-DESCORCHE'] },
    ],
  },
  {
    codigo: 'MENU-RAPIDA', nombre: 'Carta Burger Punto',
    secciones: [
      { nombre: 'Hamburguesas', skus: ['SKU-HAMBURGUESA-CLASICA', 'SKU-HAMBURGUESA-QUESO', 'SKU-HAMBURGUESA-DOBLE'] },
      { nombre: 'Tacos', skus: ['SKU-TACOS-3'] },
      { nombre: 'Acompañamientos', skus: ['SKU-PAPAS-CHICA', 'SKU-PAPAS-GRANDE', 'SKU-FRIJOLES'] },
      { nombre: 'Bebidas', skus: ['SKU-AMERICANO-12', 'SKU-LIMONADA-16', 'SKU-FRAPPE-CAFE-16'] },
      { nombre: 'Embotelladas', skus: [...embotelladas, 'SKU-CERVEZA-355'] },
      { nombre: 'Postres', skus: ['SKU-BROWNIE', 'SKU-GALLETA'] },
      { nombre: 'Servicios', skus: ['SKU-SERVICIO-DOMICILIO'] },
    ],
  },
];

/**
 * Reference prices in GTQ, multiplied by each branch's `factorPrecio`.
 * A price rise partway through the history is applied by the writer to a
 * subset of these, so reports show the old price on old tickets.
 */
export const basePrices: Record<string, number> = {
  'SKU-ESPRESSO-S': 16, 'SKU-ESPRESSO-D': 22,
  'SKU-AMERICANO-12': 18, 'SKU-AMERICANO-16': 22,
  'SKU-CAPUCHINO-12': 25, 'SKU-CAPUCHINO-16': 30,
  'SKU-LATTE-12': 26, 'SKU-LATTE-16': 32,
  'SKU-MOCHA-12': 29, 'SKU-MOCHA-16': 35,
  'SKU-FRAPPE-CAFE-16': 38, 'SKU-MATCHA-12': 32, 'SKU-MATCHA-16': 38,
  'SKU-LIMONADA-16': 20,
  'SKU-TE-NEGRO-12': 16, 'SKU-CHOCOLATE-12': 24,
  'SKU-AGUA-600': 10, 'SKU-REFRESCO-355': 14, 'SKU-JUGO-500': 18, 'SKU-CERVEZA-355': 25,
  'SKU-REBANADA-CHOCOLATE': 34, 'SKU-REBANADA-FRESA': 36, 'SKU-CHEESECAKE': 38,
  'SKU-BROWNIE': 26, 'SKU-TARTA-FRESA': 30,
  'SKU-CROISSANT': 16, 'SKU-CROISSANT-ALMENDRA': 22, 'SKU-GALLETA': 12,
  'SKU-PASTEL-CHOCOLATE': 290, 'SKU-PASTEL-FRESA': 310,
  'SKU-LOMO-PLANCHA': 115, 'SKU-POLLO-PLANCHA': 85, 'SKU-PESCADO': 105,
  'SKU-CAMARONES': 125, 'SKU-PASTA-BOLOGNESA': 78,
  'SKU-CESAR': 55, 'SKU-CESAR-POLLO': 72, 'SKU-SOPA-POLLO': 42,
  'SKU-HAMBURGUESA-CLASICA': 48, 'SKU-HAMBURGUESA-QUESO': 55, 'SKU-HAMBURGUESA-DOBLE': 72,
  'SKU-TACOS-3': 45,
  'SKU-PAPAS-CHICA': 18, 'SKU-PAPAS-GRANDE': 28, 'SKU-ARROZ': 15, 'SKU-FRIJOLES': 15,
  'SKU-SERVICIO-DOMICILIO': 20, 'SKU-DESCORCHE': 60,
};
