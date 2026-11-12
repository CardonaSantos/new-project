import type {SalesPeriod} from '../../domain/sales-period.policy.js';
// Reuses the sales report's period resolver (DIA/SEMANA/MES/ANIO/PERSONALIZADO, same
// 366-day cap) — this is genuine shared date-range math within report-exports, not a
// dependency on the ../reports module, so it doesn't conflict with the isolation the
// user asked for between the two modules.
export interface InventoryReportQuery{
 sucursalId:string;periodo:SalesPeriod;fecha?:string;desde?:string;hasta?:string;
 /** Max rows in the "stock actual" and "detalle de movimientos" tables. Default 500,
  * capped at 2000 — this is an export, not a paginated browse view. */
 limite?:number;
}
