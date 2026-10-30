import {Injectable} from '@nestjs/common';
import {ReportingPort} from './ports/reporting.port.js';
import type {Principal} from '../../auth/application/auth.service.js';
import type {OperationalQuery,ReportingQuery,TicketQuery} from './contracts/reporting.types.js';
@Injectable()
export class ReportingService{
 constructor(private readonly reports:ReportingPort){}
 overview(u:Principal,q:ReportingQuery){return this.reports.overview(u,q);}
 tickets(u:Principal,q:TicketQuery){return this.reports.tickets(u,q);}
 operational(u:Principal,q:OperationalQuery){return this.reports.operational(u,q);}
}
