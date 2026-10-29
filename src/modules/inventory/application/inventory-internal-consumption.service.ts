import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {InventoryInternalConsumptionPort} from './ports/inventory-internal-consumption.port.js';
@Injectable()
export class InventoryInternalConsumptionService {
 constructor(private readonly port:InventoryInternalConsumptionPort){}
 execute(actor:Principal,...args:any[]){return this.port.execute(actor,...args);}
}
