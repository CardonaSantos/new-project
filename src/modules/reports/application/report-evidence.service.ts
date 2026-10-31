import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import type {TicketQuery} from './contracts/reporting.types.js';
import {ReportEvidencePort,type CashEvidenceQuery} from './ports/report-evidence.port.js';
@Injectable()
export class ReportEvidenceService{
 constructor(private readonly source:ReportEvidencePort){}
 cashShift(u:Principal,shiftId:string,q:CashEvidenceQuery){return this.source.cashShift(u,shiftId,q);}
 payments(u:Principal,q:TicketQuery){return this.source.payments(u,q);}
 expenses(u:Principal,q:TicketQuery){return this.source.expenses(u,q);}
}
