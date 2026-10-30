import type {Principal} from '../../../auth/application/auth.service.js';
import type {TicketQuery} from '../contracts/reporting.types.js';
export const REPORT_SOURCES=[
 'SALES_LINES','INVENTORY_MOVEMENTS','PURCHASE_INVOICES','PURCHASE_RECEIPT_LINES',
 'DELIVERY_EVENTS','RESERVATION_EVENTS','SUPPLY_REQUESTS','SUPPLY_TRANSFERS',
 'PREPARATION_COSTS'
] as const;
export type ReportSource=typeof REPORT_SOURCES[number];
export abstract class DomainReportsPort{
 abstract records(u:Principal,source:ReportSource,q:TicketQuery):Promise<unknown>;
}
