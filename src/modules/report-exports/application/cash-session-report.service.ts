import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {CashSessionReportPort} from './ports/cash-session-report.port.js';
import type {CashSessionReportQuery} from './contracts/cash-session-report.types.js';

@Injectable()
export class CashSessionReportService{
 constructor(private readonly port:CashSessionReportPort){}
 snapshot(u:Principal,q:CashSessionReportQuery){return this.port.snapshot(u,q);}
}
