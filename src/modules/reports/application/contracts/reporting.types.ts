import type {ReportPeriodInput} from '../../domain/report-period.policy.js';
export interface ReportingQuery extends ReportPeriodInput {sucursalId:string;}
export interface TicketQuery extends ReportingQuery {page:number;limit:number;}
export interface OperationalQuery {sucursalId:string;}
// ConsolidatedQuery moved to modules/report-exports (used only by the printable-exports
// side's cross-branch rollup, not by anything in this dashboard-only module).
