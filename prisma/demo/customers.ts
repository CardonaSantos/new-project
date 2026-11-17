/**
 * Clientes de Café Pepita de Oro, como los registra la pantalla de clientes.
 *
 * Vecinos de Antigua y de los pueblos de alrededor —Jocotenango, San Pedro
 * Las Huertas, Ciudad Vieja—, dos negocios que piden con factura y gente que
 * pide por teléfono. NIT con dígito verificador válido, o CF. Las notas son las
 * que deja el personal; los correos usan el dominio reservado example.com.
 * Coordenadas reales de cada zona, para que el mapa de entregas tenga sentido.
 */

export interface DemoCustomerAddress {
  alias: string;
  direccion: string;
  referencia?: string;
  latitud: number;
  longitud: number;
}

export interface DemoCustomer {
  nombre: string;
  nit?: string;
  telefono: string;
  email?: string;
  notas?: string;
  /** Sucursales donde es cliente, por código. */
  sucursales: string[];
  direcciones: DemoCustomerAddress[];
}

const P = ['PRINCIPAL'];

export const customers: DemoCustomer[] = [
  {
    nombre: 'María José Castillo', nit: '4521876-5', telefono: '5521 3478', email: 'mariajose.castillo@example.com',
    notas: 'Latte de 16 oz con bebida de avena, todas las mañanas', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '3a Calle Poniente #18, Antigua Guatemala', referencia: 'Portón verde', latitud: 14.5592, longitud: -90.7352 }],
  },
  {
    nombre: 'José Luis Hernández', telefono: '4789 1023', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '1a Avenida Norte #9, Antigua Guatemala', latitud: 14.5612, longitud: -90.7281 }],
  },
  {
    nombre: 'Ana Lucía Pérez', nit: '3302671-8', telefono: '3302 6714', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Residenciales Santa Lucía, casa 14, Jocotenango', referencia: 'Garita de entrada, avisar al guardia', latitud: 14.5788, longitud: -90.7432 }],
  },
  {
    nombre: 'Carlos Enrique Monterroso', nit: '6719024-3', telefono: '5567 0981', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '2a Calle 4-21, San Pedro Las Huertas', latitud: 14.5398, longitud: -90.7389 }],
  },
  {
    nombre: 'Gabriela Sosa', telefono: '4120 7765', email: 'gabriela.sosa@example.com',
    notas: 'Alérgica a la almendra', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Calle de Chipilapa #6, Colonia Candelaria, Antigua Guatemala', latitud: 14.5634, longitud: -90.7255 }],
  },
  {
    nombre: 'Fernando Ixcoy', nit: '2280453-6', telefono: '5893 2210', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '4a Avenida Sur #22, Antigua Guatemala', latitud: 14.5541, longitud: -90.733 }],
  },
  {
    nombre: 'Lucrecia Batres', telefono: '3015 4482', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Residencial El Cortijo, San Pedro El Panorama', referencia: 'Casa 7, frente al parque', latitud: 14.5462, longitud: -90.7238 }],
  },
  {
    nombre: 'Rodrigo Solares', nit: '8813350-8', telefono: '5740 1196', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '4a Avenida 2-15 zona 1, Ciudad Vieja', latitud: 14.5245, longitud: -90.7612 }],
  },
  {
    nombre: 'Sofía Valdez', telefono: '4466 0372', email: 'sofia.valdez@example.com', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Calle de los Pasos #31, Antigua Guatemala', latitud: 14.5571, longitud: -90.7268 }],
  },
  {
    nombre: 'Héctor Chacón', nit: '5521907-1', telefono: '5208 6643', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '6a Calle Oriente #14, Antigua Guatemala', latitud: 14.5553, longitud: -90.7287 }],
  },
  {
    nombre: 'Paola Recinos', telefono: '3178 9054', sucursales: P,
    notas: 'Pide desayuno chapín con tortillas los sábados',
    direcciones: [{ alias: 'Casa', direccion: 'Calle Real 3-40, Jocotenango', latitud: 14.5822, longitud: -90.741 }],
  },
  {
    nombre: 'Marco Tulio Cifuentes', nit: '1093846-K', telefono: '5612 7738', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '2a Calle, Santa Ana, Antigua Guatemala', latitud: 14.5501, longitud: -90.7178 }],
  },
  {
    nombre: 'Andrea Godínez', telefono: '4987 3301', email: 'andrea.godinez@example.com', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Alameda Santa Lucía Sur #8, Antigua Guatemala', latitud: 14.5547, longitud: -90.7376 }],
  },
  {
    nombre: 'Diego Alvarado', nit: '7745210-0', telefono: '5531 0827', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Calle Principal 12, San Felipe de Jesús', latitud: 14.5762, longitud: -90.7287 }],
  },
  {
    nombre: 'Karla Morán', telefono: '3390 5612', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: '7a Avenida Norte #45, Antigua Guatemala', latitud: 14.5629, longitud: -90.7334 }],
  },
  {
    nombre: 'Julio César Ramírez', nit: '12459870-6', telefono: '5076 4419', sucursales: P,
    direcciones: [
      { alias: 'Casa', direccion: 'Calle del Hermano Pedro #20, Antigua Guatemala', latitud: 14.5527, longitud: -90.7299 },
      { alias: 'Trabajo', direccion: '4a Calle Oriente #3, Antigua Guatemala', referencia: 'Oficina del segundo nivel', latitud: 14.5571, longitud: -90.7319 },
    ],
  },
  {
    nombre: 'Estudio de Arquitectura Ruiz y Asociados', nit: '10394426-5', telefono: '7832 3390', email: 'administracion@example.com',
    notas: 'Factura a nombre de la empresa; pedidos para reuniones de la mañana', sucursales: P,
    direcciones: [{ alias: 'Oficina', direccion: '5a Calle Poniente #11, Antigua Guatemala', referencia: 'Tocar el timbre de recepción', latitud: 14.5577, longitud: -90.7341 }],
  },
  {
    nombre: 'Hostal El Zaguán', nit: '6650213-6', telefono: '7832 8812', email: 'reservas@example.com',
    notas: 'Desayunos para huéspedes; factura semanal', sucursales: P,
    direcciones: [{ alias: 'Hostal', direccion: 'Callejón del Espíritu Santo #5, Antigua Guatemala', latitud: 14.5605, longitud: -90.7246 }],
  },
  {
    nombre: 'Beatriz Orantes', telefono: '4211 8790', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Residenciales Los Arcos, casa 22, Jocotenango', latitud: 14.5801, longitud: -90.7465 }],
  },
  {
    nombre: 'Luis Pedro Arriaza', nit: '3174408-7', telefono: '5588 2046', sucursales: P,
    direcciones: [{ alias: 'Casa', direccion: 'Kilómetro 3, aldea El Hato, Antigua Guatemala', referencia: 'Entrada de terracería, casa con tejas', latitud: 14.5821, longitud: -90.7128 }],
  },
];
