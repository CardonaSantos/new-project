import type {Principal} from '../../../auth/application/auth.service.js';
import type {ProfitabilityReportQuery} from '../contracts/profitability-report.types.js';

export interface ProfitabilityProductRow{
 productoId:string;productoNombre:string;
 categoriaId:string|null;categoriaNombre:string;
 cantidadVendida:string;ingresoBruto:string;descuentos:string;ingresoNeto:string;
 costo:string;margen:string;margenPct:string;
 lineasConCosto:number;lineasTotal:number;
}
export interface ProfitabilityCategoryRow{
 categoriaId:string|null;categoriaNombre:string;productos:number;
 cantidadVendida:string;ingresoBruto:string;descuentos:string;ingresoNeto:string;
 costo:string;margen:string;margenPct:string;
 lineasConCosto:number;lineasTotal:number;
}
export interface ProfitabilityReportSnapshot{
 sucursal:{id:string;nombre:string};
 currency:string;
 periodo:{tipo:string;desde:string;hasta:string};
 generatedAt:string;
 resumen:{
  ingresoNeto:string;costo:string;margen:string;margenPct:string;
  lineasConCosto:number;lineasTotal:number;
  costoCompleto:boolean;
 };
 categorias:ProfitabilityCategoryRow[];
 productos:ProfitabilityProductRow[];
 productosTruncado:boolean;
}
export abstract class ProfitabilityReportPort{
 abstract snapshot(u:Principal,q:ProfitabilityReportQuery):Promise<ProfitabilityReportSnapshot>;
}
