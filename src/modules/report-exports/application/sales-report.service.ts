import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {SalesReportPort} from './ports/sales-report.port.js';
import type {SalesReportQuery} from './contracts/sales-report.types.js';

@Injectable()
export class SalesReportService{
 constructor(private readonly port:SalesReportPort){}
 snapshot(u:Principal,q:SalesReportQuery){return this.port.snapshot(u,q);}
}
