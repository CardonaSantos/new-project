import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {ProfitabilityReportPort} from './ports/profitability-report.port.js';
import type {ProfitabilityReportQuery} from './contracts/profitability-report.types.js';

@Injectable()
export class ProfitabilityReportService{
 constructor(private readonly port:ProfitabilityReportPort){}
 snapshot(u:Principal,q:ProfitabilityReportQuery){return this.port.snapshot(u,q);}
}
