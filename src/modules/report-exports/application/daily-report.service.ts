import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {DailyReportPort} from './ports/daily-report.port.js';
import type {DailyReportQuery} from './contracts/daily-report.types.js';

@Injectable()
export class DailyReportService{
 constructor(private readonly port:DailyReportPort){}
 snapshot(u:Principal,q:DailyReportQuery){return this.port.snapshot(u,q);}
}
