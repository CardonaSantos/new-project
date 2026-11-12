import type {SalesPeriod} from '../../domain/sales-period.policy.js';
export interface ProfitabilityReportQuery{
 sucursalId:string;periodo:SalesPeriod;fecha?:string;desde?:string;hasta?:string;limite?:number;
}
