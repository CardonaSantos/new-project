/**
 * Café Pepita de Oro: la sucursal, su carta, sus precios y su configuración.
 *
 * Es un negocio de una sola sucursal y vive en la PRINCIPAL que crea la
 * semilla inicial: se renombra y se completa, y se reutilizan su almacén,
 * su ubicación, su caja, su sala y su estación de cocina en lugar de crear
 * otras al lado. Así la UI muestra un solo local, como lo vería el dueño.
 */

export interface DemoStation {
  nombre: string;
  /** Categorías que se rutean a esta estación. */
  categorias: string[];
}

export interface DemoRoom {
  nombre: string;
  /** Números de mesa; la capacidad se asigna en orden desde `capacidades`. */
  mesas: string[];
  capacidades: number[];
}

export interface DemoBranch {
  codigo: string;
  nombre: string;
  enfoque: string;
  direccion: string;
  telefono: string;
  /** Multiplicador sobre el precio de referencia del catálogo. */
  factorPrecio: number;
  /** Tickets por día, antes de la curva semanal. */
  ticketsDia: number;
  estaciones: DemoStation[];
  salas: DemoRoom[];
  cajas: string[];
  /** Menús asignados, por código. */
  menus: string[];
  /** Participación por modalidad; suma 1. */
  modalidades: { MESA: number; MOSTRADOR: number; PARA_LLEVAR: number; DELIVERY: number };
}

export const branches: DemoBranch[] = [
  {
    codigo: 'PRINCIPAL',
    nombre: 'Café Pepita de Oro',
    enfoque: 'Café de especialidad de Antigua, desayunos chapines y repostería de la casa',
    direccion: '5a Avenida Norte #14, Antigua Guatemala, Sacatepéquez',
    telefono: '7832 4417',
    factorPrecio: 1,
    ticketsDia: 25,
    // «Cocina» y «Sala principal» y «CAJA-1» son los que crea la semilla
    // inicial: se reutilizan por nombre y código.
    estaciones: [
      { nombre: 'Barra', categorias: ['CAT-CAFE-CALIENTE', 'CAT-CAFE-FRIO', 'CAT-SIN-CAFE', 'CAT-PANADERIA'] },
      { nombre: 'Cocina', categorias: ['CAT-DESAYUNOS'] },
    ],
    salas: [
      { nombre: 'Sala principal', mesas: ['1', '2', '3', '4', '5', '6'], capacidades: [2, 4, 4, 2, 4, 2] },
      { nombre: 'Patio', mesas: ['P1', 'P2', 'P3', 'P4', 'P5'], capacidades: [4, 4, 6, 2, 4] },
    ],
    cajas: ['CAJA-1'],
    menus: ['CARTA'],
    // Una cafetería de Antigua: casi la mitad se queda en mesa o en el patio,
    // un buen tramo se lleva su café, y el domicilio es lo menos.
    modalidades: { MESA: 0.45, MOSTRADOR: 0.15, PARA_LLEVAR: 0.28, DELIVERY: 0.12 },
  },
];

export interface DemoMenu {
  codigo: string;
  nombre: string;
  secciones: { nombre: string; skus: string[] }[];
  /**
   * Franja horaria (diaSemana 0-6, HH:MM). Un menú con horario desaparece del
   * POS fuera de su franja, así que la carta no lleva: se usa a cualquier hora.
   */
  horario?: { diaSemana: number; desde: string; hasta: string }[];
}

export const menus: DemoMenu[] = [
  {
    codigo: 'CARTA',
    nombre: 'Carta Pepita de Oro',
    secciones: [
      {
        nombre: 'Café caliente',
        skus: [
          'SKU-ESPRESSO-SENCILLO', 'SKU-ESPRESSO-DOBLE', 'SKU-AMERICANO-8', 'SKU-AMERICANO-12',
          'SKU-PICHEL-8', 'SKU-PICHEL-12', 'SKU-CAFE-LECHE-12', 'SKU-CAPUCHINO-8', 'SKU-CAPUCHINO-12',
          'SKU-LATTE-12', 'SKU-LATTE-16', 'SKU-MOCHA-12', 'SKU-MOCHA-16', 'SKU-BOMBON-8',
          'SKU-CHOCOLATE-8', 'SKU-CHOCOLATE-12', 'SKU-CHAI-12', 'SKU-TE-12',
        ],
      },
      { nombre: 'Café frío', skus: ['SKU-COLD-BREW-12', 'SKU-COLD-BREW-16', 'SKU-LATTE-FRIO-16', 'SKU-FRAPPE-16'] },
      { nombre: 'Sin café', skus: ['SKU-LIMONADA-16', 'SKU-LICUADO-BANANO', 'SKU-LICUADO-FRESA', 'SKU-ATOL-12'] },
      {
        nombre: 'Desayunos todo el día',
        skus: ['SKU-DESAYUNO-CHAPIN', 'SKU-PANQUEQUES', 'SKU-TOSTADA-AGUACATE', 'SKU-SANDWICH-CROISSANT'],
      },
      {
        nombre: 'Pan y repostería',
        skus: ['SKU-CROISSANT', 'SKU-PAN-BANANO', 'SKU-RELLENITO', 'SKU-CHAMPURRADA', 'SKU-CHEESECAKE', 'SKU-TRES-LECHES'],
      },
      { nombre: 'Embotelladas', skus: ['SKU-AGUA-PURA', 'SKU-AGUA-MINERAL'] },
      { nombre: 'Servicio a domicilio', skus: ['SKU-SERVICIO-DOMICILIO'] },
    ],
  },
];

/** Los equipos de la sucursal, como los registra la pantalla de dispositivos. */
export interface DemoDevice {
  codigo: string;
  nombre: string;
  tipo: 'POS' | 'KDS' | 'QUIOSCO' | 'IMPRESORA';
  /** Estación a la que se ata (solo KDS). */
  estacion?: string;
}

export const devices: Record<string, DemoDevice[]> = {
  PRINCIPAL: [
    { codigo: 'CAJA-01', nombre: 'Caja del mostrador', tipo: 'POS' },
    { codigo: 'KDS-BARRA', nombre: 'Pantalla de barra', tipo: 'KDS', estacion: 'Barra' },
    { codigo: 'KDS-COCINA', nombre: 'Pantalla de cocina', tipo: 'KDS', estacion: 'Cocina' },
    { codigo: 'IMP-RECIBOS', nombre: 'Impresora de recibos', tipo: 'IMPRESORA' },
  ],
};

/**
 * Variantes pausadas. Ninguna: una pausa corre desde hoy y el sistema la
 * aplica contra el reloj real, así que el producto no se habría vendido en
 * todo el período y la historia lo mostraría como un producto muerto.
 */
export const variantPauses: { sucursal: string; sku: string; dias: number; motivo: string }[] = [];

/**
 * Tesorería: la cuenta bancaria y la caja fuerte de la sucursal, con las
 * rutas que el motor de pagos consulta al cobrar. Con la ruta activa, cada
 * cobro con tarjeta o transferencia verificada asienta su movimiento solo. La
 * reposición semanal se paga desde el banco; la compra de apertura no, y queda
 * como inversión inicial pendiente de cuenta. Los servicios del mes se pagan
 * como gasto con origen en la cuenta.
 */
export const BANK_ACCOUNT = { nombre: 'Banco Industrial Monetaria GTQ', tipo: 'BANCO' as const };
export const SAFE_ACCOUNT_PREFIX = 'Caja fuerte';
// Solo lo que la pantalla de rutas acepta: TARJETA, TRANSFERENCIA u OTRO. El
// efectivo entra a la caja del turno y el cobro nunca consulta una ruta.
export const FINANCIAL_ROUTES: { metodo: 'TARJETA' | 'TRANSFERENCIA'; cuenta: 'BANCO' }[] = [
  { metodo: 'TARJETA', cuenta: 'BANCO' },
  { metodo: 'TRANSFERENCIA', cuenta: 'BANCO' },
];

/** Precio por variante, en GTQ: cafetería de especialidad en Antigua, 2026. */
export const basePrices: Record<string, number> = {
  'SKU-ESPRESSO-SENCILLO': 14,
  'SKU-ESPRESSO-DOBLE': 18,
  'SKU-AMERICANO-8': 16,
  'SKU-AMERICANO-12': 20,
  'SKU-PICHEL-8': 12,
  'SKU-PICHEL-12': 15,
  'SKU-CAFE-LECHE-12': 18,
  'SKU-CAPUCHINO-8': 22,
  'SKU-CAPUCHINO-12': 26,
  'SKU-LATTE-12': 26,
  'SKU-LATTE-16': 30,
  'SKU-MOCHA-12': 30,
  'SKU-MOCHA-16': 34,
  'SKU-BOMBON-8': 20,
  'SKU-CHOCOLATE-8': 18,
  'SKU-CHOCOLATE-12': 22,
  'SKU-CHAI-12': 28,
  'SKU-TE-12': 12,
  'SKU-COLD-BREW-12': 26,
  'SKU-COLD-BREW-16': 30,
  'SKU-LATTE-FRIO-16': 30,
  'SKU-FRAPPE-16': 32,
  'SKU-LIMONADA-16': 18,
  'SKU-LICUADO-BANANO': 20,
  'SKU-LICUADO-FRESA': 24,
  'SKU-ATOL-12': 15,
  'SKU-DESAYUNO-CHAPIN': 55,
  'SKU-PANQUEQUES': 42,
  'SKU-TOSTADA-AGUACATE': 45,
  'SKU-SANDWICH-CROISSANT': 42,
  'SKU-CROISSANT': 16,
  'SKU-PAN-BANANO': 18,
  'SKU-RELLENITO': 7,
  'SKU-CHAMPURRADA': 4,
  'SKU-CHEESECAKE': 30,
  'SKU-TRES-LECHES': 26,
  'SKU-AGUA-PURA': 8,
  'SKU-AGUA-MINERAL': 15,
  'SKU-SERVICIO-DOMICILIO': 15,
};
