import type {Principal} from '../../../auth/application/auth.service.js';
import type {TicketQuery} from '../contracts/reporting.types.js';
export interface CashEvidenceQuery{
 sucursalId:string;page:number;limit:number;tipo?:'INGRESO'|'EGRESO';
}
/** Same read models feed Angular drilldown and REP-2 export writers. */
export abstract class ReportEvidencePort{
 abstract cashShift(u:Principal,shiftId:string,q:CashEvidenceQuery):Promise<unknown>;
 abstract payments(u:Principal,q:TicketQuery):Promise<unknown>;
 abstract expenses(u:Principal,q:TicketQuery):Promise<unknown>;
}
