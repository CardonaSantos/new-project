/**
 * Clientes de demostración.
 *
 * Los crea la fase de maestros tal como los crearía la pantalla de clientes:
 * nombre, NIT (o CF, que es como factura medio país), teléfono de ocho
 * dígitos y direcciones con zona y coordenadas de la capital, porque la
 * pantalla de entrega las pinta en el mapa. Las órdenes a domicilio de la
 * historia referencian a estos clientes por `Orden.clienteId`, de modo que el
 * detalle de un cliente frecuente muestra sus pedidos del mes.
 *
 * `notas` lleva la marca DEMO-SEED a propósito: `Cliente` no tiene código con
 * prefijo como el resto del catálogo, y esa marca es el ancla que el reset
 * usa para borrarlos sin tocar clientes reales.
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
  /** Sucursales donde es cliente frecuente, por código. */
  sucursales: string[];
  direcciones: DemoCustomerAddress[];
}

export const DEMO_CUSTOMER_MARK = 'DEMO-SEED';

export const customers: DemoCustomer[] = [
  { nombre: 'María Fernanda López', nit: '4578123-5', telefono: '55123487', email: 'mafer.lopez@gmail.com', sucursales: ['CAFETERIA', 'REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '12 avenida 3-45 zona 10, Edificio Vista Real apto 7B', referencia: 'Portón negro, timbre 7B', latitud: 14.5997, longitud: -90.5069 },
    { alias: 'Oficina', direccion: 'Diagonal 6 10-01 zona 10, Torre Citigroup nivel 9', latitud: 14.5991, longitud: -90.5102 } ] },
  { nombre: 'José Carlos Morales', nit: '7812456-9', telefono: '42785613', sucursales: ['RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: '21 calle 8-14 zona 11, Colonia Mariscal', referencia: 'Casa celeste de dos niveles', latitud: 14.6012, longitud: -90.5537 } ] },
  { nombre: 'Ana Lucía Castillo', nit: 'CF', telefono: '31459872', email: 'analucia.castillo@hotmail.com', sucursales: ['REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '4a calle 7-22 zona 1', referencia: 'Frente a la farmacia Batres', latitud: 14.6412, longitud: -90.5133 } ] },
  { nombre: 'Luis Pedro Arriola', nit: '5523871-2', telefono: '55901234', sucursales: ['RESTAURANTE'], direcciones: [
    { alias: 'Casa', direccion: 'Boulevard Los Próceres 24-69 zona 10, Condominio Alcázar', referencia: 'Garita, dejar con el guardia', latitud: 14.5873, longitud: -90.4998 } ] },
  { nombre: 'Sofía Alejandra Méndez', nit: '9014782-3', telefono: '47823190', email: 'sofimendez@yahoo.com', sucursales: ['CAFETERIA'], direcciones: [
    { alias: 'Apartamento', direccion: '6a avenida 9-18 zona 9, Edificio Catalina 3A', latitud: 14.6085, longitud: -90.5177 } ] },
  { nombre: 'Diego Andrés Herrera', nit: 'CF', telefono: '58412369', sucursales: ['RAPIDA', 'RESTAURANTE'], direcciones: [
    { alias: 'Casa', direccion: '3a calle 2-14 zona 3, Colonia El Sauce', referencia: 'Portón de madera junto a tienda La Bendición', latitud: 14.6531, longitud: -90.5289 } ] },
  { nombre: 'Gabriela Ramírez de León', nit: '6678234-1', telefono: '53678124', email: 'gabyramirez@gmail.com', sucursales: ['REPOSTERIA', 'CAFETERIA'], direcciones: [
    { alias: 'Casa', direccion: '15 avenida 6-30 zona 13, Colonia Aurora I', referencia: 'A dos cuadras del aeropuerto', latitud: 14.5822, longitud: -90.5312 },
    { alias: 'Trabajo', direccion: 'Avenida Reforma 8-60 zona 9, Edificio Galerías Reforma', latitud: 14.6064, longitud: -90.5144 } ] },
  { nombre: 'Rodrigo Estrada Paz', nit: '3345912-7', telefono: '41236790', sucursales: ['RESTAURANTE'], direcciones: [
    { alias: 'Casa', direccion: '7a avenida 11-05 zona 4, Cuatro Grados Norte', latitud: 14.6219, longitud: -90.5156 } ] },
  { nombre: 'Daniela Marroquín', nit: 'CF', telefono: '56784321', email: 'dmarroquin@ufm.edu', sucursales: ['CAFETERIA'], direcciones: [
    { alias: 'Universidad', direccion: 'Calle Manuel F. Ayau zona 10, UFM edificio académico', referencia: 'Entregar en recepción', latitud: 14.6033, longitud: -90.4897 } ] },
  { nombre: 'Pablo Antonio Girón', nit: '8891245-6', telefono: '30127845', sucursales: ['RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: 'Calzada Roosevelt 15-30 zona 7, Colonia Landívar', referencia: 'Pasaje peatonal, segunda casa', latitud: 14.6262, longitud: -90.5558 } ] },
  { nombre: 'Lucía Fernanda Ochoa', nit: '2214567-8', telefono: '55098712', sucursales: ['REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '9a calle 4-11 zona 1, cerca del Portal del Comercio', latitud: 14.6405, longitud: -90.5146 } ] },
  { nombre: 'Marco Vinicio Soto', nit: 'CF', telefono: '48561237', sucursales: ['RESTAURANTE', 'RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: '20 calle 12-33 zona 10, La Cañada', referencia: 'Cluster 3, casa 12', latitud: 14.5934, longitud: -90.5021 } ] },
  { nombre: 'Andrea Beatriz Fuentes', nit: '7734128-4', telefono: '53214568', email: 'andrea.fuentes@outlook.com', sucursales: ['CAFETERIA'], direcciones: [
    { alias: 'Apartamento', direccion: 'Vía 5 4-50 zona 4, Edificio Tívoli 21', latitud: 14.6198, longitud: -90.5178 } ] },
  { nombre: 'Jorge Mario Reyes', nit: '1123890-2', telefono: '42657813', sucursales: ['RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: '31 avenida 5-29 zona 7, Tikal I', referencia: 'Frente al parque', latitud: 14.6301, longitud: -90.5612 } ] },
  { nombre: 'Claudia Verónica Juárez', nit: 'CF', telefono: '57891324', sucursales: ['REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '2a avenida 13-42 zona 2, Ciudad Nueva', latitud: 14.6523, longitud: -90.5108 } ] },
  { nombre: 'Fernando José Aguilar', nit: '6612478-9', telefono: '31784520', email: 'faguilar@intecap.edu.gt', sucursales: ['RESTAURANTE'], direcciones: [
    { alias: 'Oficina', direccion: 'Calle Mariscal Cruz 1-56 zona 10', referencia: 'Edificio de ladrillo, nivel 2', latitud: 14.6013, longitud: -90.5131 } ] },
  { nombre: 'Paola Regina Navas', nit: '4456789-1', telefono: '55671298', sucursales: ['CAFETERIA', 'REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '10a avenida 10-10 zona 14, Las Conchas', referencia: 'Garita La Pradera', latitud: 14.5786, longitud: -90.5083 } ] },
  { nombre: 'Ricardo Alberto Monzón', nit: 'CF', telefono: '40238915', sucursales: ['RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: '5a calle 25-60 zona 12, Colonia Reformita', latitud: 14.6089, longitud: -90.5423 } ] },
  { nombre: 'Silvia Eugenia Pineda', nit: '3387214-5', telefono: '53908764', email: 'silviapineda@gmail.com', sucursales: ['REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '11 avenida 14-28 zona 1', referencia: 'Media cuadra del mercado Central', latitud: 14.6437, longitud: -90.5119 } ] },
  { nombre: 'Héctor Leonel Barrios', nit: '9923145-6', telefono: '47125890', sucursales: ['RESTAURANTE'], direcciones: [
    { alias: 'Casa', direccion: '14 calle 3-51 zona 10, Edificio Tadeus 8C', latitud: 14.5968, longitud: -90.5091 } ] },
  { nombre: 'Mónica Isabel Valdez', nit: 'CF', telefono: '58763421', sucursales: ['CAFETERIA'], direcciones: [
    { alias: 'Casa', direccion: '19 avenida 2-78 zona 15, Vista Hermosa II', referencia: 'Casa esquinera con buganvilia', latitud: 14.6056, longitud: -90.4876 } ] },
  { nombre: 'Óscar Rolando Castañeda', nit: '5578912-3', telefono: '32415678', sucursales: ['RAPIDA', 'CAFETERIA'], direcciones: [
    { alias: 'Taller', direccion: 'Calzada San Juan 32-50 zona 7', referencia: 'Taller mecánico El Buen Amigo', latitud: 14.6334, longitud: -90.5672 } ] },
  { nombre: 'Karla Patricia Solís', nit: '2289671-4', telefono: '55342817', email: 'karlasolis@icloud.com', sucursales: ['REPOSTERIA'], direcciones: [
    { alias: 'Casa', direccion: '6a avenida A 10-62 zona 2', latitud: 14.6498, longitud: -90.5141 } ] },
  { nombre: 'Estuardo Rafael Contreras', nit: 'CF', telefono: '41879023', sucursales: ['RESTAURANTE'], direcciones: [
    { alias: 'Casa', direccion: '16 calle 4-89 zona 13, Colonia La Libertad', referencia: 'Frente al Museo del Niño', latitud: 14.5891, longitud: -90.5267 } ] },
  { nombre: 'Alejandra Montes de Oca', nit: '8845123-7', telefono: '53671209', sucursales: ['CAFETERIA'], direcciones: [
    { alias: 'Apartamento', direccion: '1a avenida 12-46 zona 10, Edificio Dubai Center 5A', latitud: 14.5951, longitud: -90.5118 } ] },
  { nombre: 'Byron Estuardo Galindo', nit: '6690234-8', telefono: '47098156', sucursales: ['RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: '38 avenida 4-15 zona 5, Colonia Arrivillaga', referencia: 'Subida del puente, casa verde', latitud: 14.6178, longitud: -90.4989 } ] },
  { nombre: 'Rosa María Espinoza', nit: 'CF', telefono: '30897245', sucursales: ['REPOSTERIA', 'RESTAURANTE'], direcciones: [
    { alias: 'Casa', direccion: '3a avenida 8-20 zona 1', referencia: 'A la par del Hotel Pan American', latitud: 14.6419, longitud: -90.5152 } ] },
  { nombre: 'Guillermo Enrique Paiz', nit: '1156734-9', telefono: '56214387', email: 'gpaiz@bancoindustrial.com', sucursales: ['RESTAURANTE'], direcciones: [
    { alias: 'Oficina', direccion: '7a avenida 5-10 zona 4, Centro Financiero Torre I', referencia: 'Recepción nivel 10', latitud: 14.6224, longitud: -90.5133 } ] },
  { nombre: 'Ingrid Carolina Donis', nit: '7723481-2', telefono: '55781036', sucursales: ['CAFETERIA'], direcciones: [
    { alias: 'Casa', direccion: '21 avenida 33-58 zona 5, Jardines de la Asunción', latitud: 14.6142, longitud: -90.4923 } ] },
  { nombre: 'Walter Geovanni Mazariegos', nit: 'CF', telefono: '42903178', sucursales: ['RAPIDA'], direcciones: [
    { alias: 'Casa', direccion: '13 calle 15-33 zona 6, Proyectos 4-4', referencia: 'Bloque C, apartamento 2', latitud: 14.6587, longitud: -90.4951 } ] },
];
