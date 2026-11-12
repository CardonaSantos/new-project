import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {InventoryReportPort} from './ports/inventory-report.port.js';
import type {InventoryReportQuery} from './contracts/inventory-report.types.js';

@Injectable()
export class InventoryReportService{
 constructor(private readonly port:InventoryReportPort){}
 snapshot(u:Principal,q:InventoryReportQuery){return this.port.snapshot(u,q);}
}
