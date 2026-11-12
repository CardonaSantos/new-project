import type {Principal} from '../../../auth/application/auth.service.js';
import type {SalesReportQuery} from '../contracts/sales-report.types.js';

export interface SalesReportDay{
 fecha:string;
 ventasBrutas:string;descuentos:string;ventasNetas:string;cantidadVentas:number;
 cobrado:string;reembolsado:string;dineroEntrante:string;ordenesCerradas:number;
}
export interface SalesReportSnapshot{
 sucursal:{id:string;nombre:string};
 currency:string;
 periodo:{tipo:string;desde:string;hasta:string};
 generatedAt:string;
 resumen:{
  ventasBrutas:string;descuentos:string;ventasNetas:string;cantidadVentas:number;
  cobrado:string;reembolsado:string;dineroEntrante:string;ordenesCerradas:number;
  ordenesCanceladas:number;
 };
 porMetodoPago:Array<{metodo:string;cobrado:string;reembolsado:string;neto:string;cantidad:number}>;
 serieDiaria:SalesReportDay[];
}
export abstract class SalesReportPort{
 abstract snapshot(u:Principal,q:SalesReportQuery):Promise<SalesReportSnapshot>;
}
