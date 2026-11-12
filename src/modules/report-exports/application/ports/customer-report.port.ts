import type {Principal} from '../../../auth/application/auth.service.js';
import type {CustomerReportQuery} from '../contracts/customer-report.types.js';

export interface CustomerReportRow{
 clienteId:string;nombre:string;nit:string;telefono:string;email:string;
 activo:boolean;registradoEn:string;notas:string;
 direccionPrincipal:string;cantidadDirecciones:number;
 cantidadVentas:number;totalGastado:string;ticketPromedio:string;
 primeraCompra:string;ultimaCompra:string;
 cantidadOrdenes:number;ordenesCanceladas:number;
 cantidadReservas:number;reservasNoAsistio:number;
}
export interface CustomerReportSnapshot{
 sucursal:{id:string;nombre:string};
 currency:string;
 generatedAt:string;
 filtros:{soloActivos:boolean;limite:number};
 resumen:{
  totalClientes:number;clientesActivos:number;clientesInactivos:number;
  clientesConCompras:number;
 };
 clientes:CustomerReportRow[];
}
export abstract class CustomerReportPort{
 abstract snapshot(u:Principal,q:CustomerReportQuery):Promise<CustomerReportSnapshot>;
}
