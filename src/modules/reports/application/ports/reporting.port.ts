import type {Principal} from '../../../auth/application/auth.service.js';
import type {OperationalQuery,ReportingQuery,TicketQuery} from '../contracts/reporting.types.js';
export abstract class ReportingPort{
 abstract overview(u:Principal,q:ReportingQuery):Promise<unknown>;
 abstract tickets(u:Principal,q:TicketQuery):Promise<unknown>;
 abstract operational(u:Principal,q:OperationalQuery):Promise<unknown>;
}
