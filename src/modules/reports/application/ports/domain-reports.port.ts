import type {Principal} from '../../../auth/application/auth.service.js';
import type {TicketQuery,ConsolidatedQuery} from '../contracts/reporting.types.js';
export const REPORT_SOURCES=[
 'SALES_LINES','INVENTORY_MOVEMENTS','PURCHASE_INVOICES','PURCHASE_RECEIPT_LINES',
 'DELIVERY_EVENTS','RESERVATION_EVENTS','SUPPLY_REQUESTS','SUPPLY_TRANSFERS',
 'PREPARATION_COSTS','SALES_COSTS','ORDER_COST_OUTCOMES',
 'PAYMENT_SALES_RECON','SUPPLIER_BALANCES','PLATFORM_SETTLEMENTS','BANK_MATCH_STATUS'
] as const;
export type ReportSource=typeof REPORT_SOURCES[number];
export abstract class DomainReportsPort{
 abstract records(u:Principal,source:ReportSource,q:TicketQuery):Promise<unknown>;
 abstract consolidated(u:Principal,q:ConsolidatedQuery):Promise<unknown>;
}
