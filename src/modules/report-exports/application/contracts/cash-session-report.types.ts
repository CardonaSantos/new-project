import type {SalesPeriod} from '../../domain/sales-period.policy.js';
export interface CashSessionReportQuery{
 sucursalId:string;periodo:SalesPeriod;fecha?:string;desde?:string;hasta?:string;
}
