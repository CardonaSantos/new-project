import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {CustomerReportPort} from './ports/customer-report.port.js';
import type {CustomerReportQuery} from './contracts/customer-report.types.js';

@Injectable()
export class CustomerReportService{
 constructor(private readonly port:CustomerReportPort){}
 snapshot(u:Principal,q:CustomerReportQuery){return this.port.snapshot(u,q);}
}
