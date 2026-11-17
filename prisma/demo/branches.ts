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
    menus: ['MENU-CAFETERIA', 'MENU-DESAYUNOS'],
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
  /**
   * Franja horaria del menú (diaSemana 0-6, horas HH:MM), como la edita la
   * pantalla de detalle de menú. Sin horario, el menú rige todo el día.
   * Regla de los datos: un menú con horario solo usa SKUs que ya están en el
   * menú principal de la misma sucursal, para que el motor de la semilla
   * —que ignora horarios— no venda nada que el POS no mostraría.
   */
  horario?: { diaSemana: number; desde: string; hasta: string }[];
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
      { nombre: 'Pastelería', skus: ['SKU-REBANADA-CHOCOLATE', 'SKU-REBANADA-FRESA', 'SKU-TRES-LECHES', 'SKU-CHEESECAKE', 'SKU-BROWNIE', 'SKU-TARTA-FRESA'] },
      { nombre: 'Panadería', skus: ['SKU-CROISSANT', 'SKU-CROISSANT-ALMENDRA', 'SKU-CHAMPURRADA', 'SKU-GALLETA'] },
      { nombre: 'Pasteles enteros', skus: ['SKU-PASTEL-CHOCOLATE', 'SKU-PASTEL-FRESA'] },
      { nombre: 'Café', skus: cafeSkus },
      { nombre: 'Para acompañar', skus: [...embotelladas, 'SKU-CHOCOLATE-12', 'SKU-TE-NEGRO-12', 'SKU-JAMAICA-16', 'SKU-HORCHATA-16'] },
      { nombre: 'Servicios', skus: ['SKU-SERVICIO-DOMICILIO'] },
    ],
  },
  {
    codigo: 'MENU-CAFETERIA', nombre: 'Carta Café Altura',
    secciones: [
      { nombre: 'Café caliente', skus: cafeSkus },
      { nombre: 'Bebidas frías', skus: ['SKU-FRAPPE-CAFE-16', 'SKU-LIMONADA-16', 'SKU-JAMAICA-16', 'SKU-HORCHATA-16', 'SKU-LICUADO-BANANO', 'SKU-LICUADO-FRESA'] },
      { nombre: 'Infusiones', skus: ['SKU-TE-NEGRO-12', 'SKU-CHOCOLATE-12'] },
      { nombre: 'Repostería', skus: ['SKU-REBANADA-CHOCOLATE', 'SKU-TRES-LECHES', 'SKU-CHEESECAKE', 'SKU-BROWNIE', 'SKU-CROISSANT', 'SKU-CROISSANT-ALMENDRA', 'SKU-CHAMPURRADA', 'SKU-GALLETA'] },
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
      { nombre: 'Postres', skus: ['SKU-REBANADA-CHOCOLATE', 'SKU-REBANADA-FRESA', 'SKU-TRES-LECHES', 'SKU-CHEESECAKE'] },
      { nombre: 'Bebidas', skus: [...cafeSkus, 'SKU-LIMONADA-16', 'SKU-JAMAICA-16', 'SKU-HORCHATA-16', 'SKU-TE-NEGRO-12'] },
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
      { nombre: 'Bebidas', skus: ['SKU-AMERICANO-12', 'SKU-LIMONADA-16', 'SKU-JAMAICA-16', 'SKU-FRAPPE-CAFE-16'] },
      { nombre: 'Embotelladas', skus: [...embotelladas, 'SKU-CERVEZA-355'] },
      { nombre: 'Postres', skus: ['SKU-BROWNIE', 'SKU-GALLETA', 'SKU-CHAMPURRADA'] },
      { nombre: 'Servicios', skus: ['SKU-SERVICIO-DOMICILIO'] },
    ],
  },
];

/**
 * Reference prices in GTQ, multiplied by each branch's `factorPrecio`.
 * A price rise partway through the history is applied by the writer to a
 * subset of these, so reports show the old price on old tickets.
 */
export const desayunosMenu: DemoMenu = {
  codigo: 'MENU-DESAYUNOS',
  nombre: 'Desayunos',
  // Todos los días de 6:00 a 11:00 — la pantalla de menús muestra la franja y
  // el POS lo oculta fuera de ella.
  horario: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, desde: '06:00', hasta: '11:00' })),
  secciones: [
    { nombre: 'Para empezar el día', skus: ['SKU-CROISSANT', 'SKU-CROISSANT-ALMENDRA', 'SKU-CHAMPURRADA', 'SKU-GALLETA'] },
    { nombre: 'Café de la mañana', skus: ['SKU-AMERICANO-12', 'SKU-CAPUCHINO-12', 'SKU-LATTE-12', 'SKU-CHOCOLATE-12', 'SKU-TE-NEGRO-12'] },
    { nombre: 'Jugos y licuados', skus: ['SKU-JUGO-500', 'SKU-LICUADO-BANANO', 'SKU-LICUADO-FRESA'] },
  ],
};

/**
 * Dispositivos por sucursal, como los registra la pantalla de dispositivos:
 * la caja (POS), la pantalla de cocina (KDS) atada a su estación de
 * preparación, y lo que distingue a cada local — el kiosko de autoservicio en
 * comida rápida, la impresora de comandas del restaurante.
 */
export interface DemoDevice {
  codigo: string;
  nombre: string;
  tipo: 'POS' | 'KDS' | 'QUIOSCO' | 'IMPRESORA';
  /** Nombre de la estación de preparación a la que se ata (solo KDS). */
  estacion?: string;
}

export const devices: Record<string, DemoDevice[]> = {
  REPOSTERIA: [
    { codigo: 'CAJA-01', nombre: 'Caja mostrador', tipo: 'POS' },
    { codigo: 'KDS-PRODUCCION', nombre: 'Pantalla de producción', tipo: 'KDS', estacion: 'Cocina' },
    { codigo: 'IMP-RECIBOS', nombre: 'Impresora de recibos', tipo: 'IMPRESORA' },
  ],
  CAFETERIA: [
    { codigo: 'CAJA-01', nombre: 'Caja principal', tipo: 'POS' },
    { codigo: 'KDS-BARRA', nombre: 'Pantalla de barra', tipo: 'KDS', estacion: 'Barra' },
  ],
  RESTAURANTE: [
    { codigo: 'CAJA-01', nombre: 'Caja principal', tipo: 'POS' },
    { codigo: 'KDS-COCINA', nombre: 'Pantalla de cocina', tipo: 'KDS', estacion: 'Cocina' },
    { codigo: 'IMP-COMANDAS', nombre: 'Impresora de comandas', tipo: 'IMPRESORA' },
  ],
  RAPIDA: [
    { codigo: 'CAJA-01', nombre: 'Caja principal', tipo: 'POS' },
    { codigo: 'KIOSKO-01', nombre: 'Kiosko de autoservicio', tipo: 'QUIOSCO' },
    { codigo: 'KDS-COCINA', nombre: 'Pantalla de cocina', tipo: 'KDS', estacion: 'Cocina' },
  ],
};

/**
 * Variantes pausadas por sucursal, como las deja la pantalla de detalle de
 * producto. La pausa corre desde el final de la historia hacia adelante, así
 * que las ventas del mes no la contradicen: el producto se vendió hasta hoy y
 * hoy está pausado, que es exactamente la escena que un negocio real muestra.
 */
export const variantPauses: { sucursal: string; sku: string; dias: number; motivo: string }[] = [
  { sucursal: 'RESTAURANTE', sku: 'SKU-CAMARONES', dias: 3, motivo: 'Proveedor sin camarón fresco esta semana' },
  { sucursal: 'CAFETERIA', sku: 'SKU-LICUADO-FRESA', dias: 5, motivo: 'Fresa fuera de temporada' },
  { sucursal: 'RAPIDA', sku: 'SKU-HAMBURGUESA-DOBLE', dias: 2, motivo: 'Plancha grande en mantenimiento' },
];

/**
 * Tesorería: por sucursal, una cuenta bancaria y una caja fuerte, con las
 * rutas que el motor de pagos consulta al cobrar. Con la ruta activa, cada
 * cobro con tarjeta o transferencia verificada asienta su MovimientoFinanciero
 * solo. Los pagos a proveedor llegan al banco cuando el pago lleva la cuenta
 * (la reposición semanal la lleva; la compra de apertura no, y queda como
 * inversión inicial pendiente de cuenta), y los servicios del mes se pagan
 * como gasto con origen en la cuenta.
 */
export const BANK_ACCOUNT = { nombre: 'BAC Cuenta Monetaria GTQ', tipo: 'BANCO' as const };
export const SAFE_ACCOUNT_PREFIX = 'Caja fuerte';
/** Método de pago → a qué cuenta llega el dinero. */
// Solo lo que la pantalla de rutas acepta: TARJETA, TRANSFERENCIA u OTRO. El
// efectivo entra a la caja del turno y el cobro nunca consulta una ruta para
// él; la ruta EFECTIVO que hubo aquí no se podía crear desde la UI.
export const FINANCIAL_ROUTES: { metodo: 'TARJETA' | 'TRANSFERENCIA'; cuenta: 'BANCO' }[] = [
  { metodo: 'TARJETA', cuenta: 'BANCO' },
  { metodo: 'TRANSFERENCIA', cuenta: 'BANCO' },
];

// Se escribe junto a los demás: masters recorre `menus`, y la cafetería lo
// referencia en su lista. (Declarado aparte para no romper el orden de
// declaración dentro del arreglo.)
menus.push(desayunosMenu);

export const basePrices: Record<string, number> = {
  // Café: Café Barista en Antigua lista capuchino Q30 y latte Q29; McDonald's
  // el de 12 oz a Q21. Estos son precios base, antes del factor por sucursal,
  // así que la cafetería de zona 10 termina cerca del extremo alto y la
  // repostería de zona 1 por debajo.
  'SKU-ESPRESSO-S': 14, 'SKU-ESPRESSO-D': 19,
  'SKU-AMERICANO-12': 16, 'SKU-AMERICANO-16': 19,
  'SKU-CAPUCHINO-12': 22, 'SKU-CAPUCHINO-16': 26,
  'SKU-LATTE-12': 23, 'SKU-LATTE-16': 27,
  'SKU-MOCHA-12': 26, 'SKU-MOCHA-16': 30,
  'SKU-FRAPPE-CAFE-16': 32,
  'SKU-LIMONADA-16': 14, 'SKU-JAMAICA-16': 13, 'SKU-HORCHATA-16': 13,
  'SKU-LICUADO-BANANO': 18, 'SKU-LICUADO-FRESA': 20,
  'SKU-TE-NEGRO-12': 12, 'SKU-CHOCOLATE-12': 20,
  // Embotelladas: la lata de cerveza cuesta Q8.90 en góndola y Q20 en menú.
  'SKU-AGUA-600': 8, 'SKU-REFRESCO-355': 12, 'SKU-JUGO-500': 16, 'SKU-CERVEZA-355': 18,
  // Repostería: una rebanada va de Q20 a Q30 según el lugar.
  'SKU-REBANADA-CHOCOLATE': 26, 'SKU-REBANADA-FRESA': 28, 'SKU-TRES-LECHES': 28,
  'SKU-CHEESECAKE': 30, 'SKU-BROWNIE': 20, 'SKU-TARTA-FRESA': 24,
  'SKU-CROISSANT': 13, 'SKU-CROISSANT-ALMENDRA': 18, 'SKU-GALLETA': 8, 'SKU-CHAMPURRADA': 5,
  'SKU-PASTEL-CHOCOLATE': 245, 'SKU-PASTEL-FRESA': 265,
  // Platos fuertes: un lomito de rango medio ronda Q95.
  'SKU-LOMO-PLANCHA': 95, 'SKU-POLLO-PLANCHA': 68, 'SKU-PESCADO': 85,
  'SKU-CAMARONES': 110, 'SKU-PASTA-BOLOGNESA': 65,
  'SKU-CESAR': 45, 'SKU-CESAR-POLLO': 60, 'SKU-SOPA-POLLO': 30,
  // Comida rápida: la quesoburguesa suelta ronda Q35 y un combo de marca Q55.
  'SKU-HAMBURGUESA-CLASICA': 38, 'SKU-HAMBURGUESA-QUESO': 44, 'SKU-HAMBURGUESA-DOBLE': 60,
  'SKU-TACOS-3': 35,
  'SKU-PAPAS-CHICA': 14, 'SKU-PAPAS-GRANDE': 22, 'SKU-ARROZ': 12, 'SKU-FRIJOLES': 12,
  'SKU-SERVICIO-DOMICILIO': 20, 'SKU-DESCORCHE': 50,
};
