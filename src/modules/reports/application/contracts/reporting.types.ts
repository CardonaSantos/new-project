import type {ReportPeriodInput} from '../../domain/report-period.policy.js';
export interface ReportingQuery extends ReportPeriodInput {sucursalId:string;}
export interface TicketQuery extends ReportingQuery {page:number;limit:number;}
export interface OperationalQuery {sucursalId:string;}
