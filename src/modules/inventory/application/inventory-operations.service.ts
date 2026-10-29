import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {InventoryOperationsPort} from './ports/inventory-operations.port.js';
@Injectable()
export class InventoryOperationsService {
 constructor(private readonly port:InventoryOperationsPort){}
 stock(actor:Principal,...args:any[]){return this.port.stock(actor,...args);}
 summary(actor:Principal,...args:any[]){return this.port.summary(actor,...args);}
 lots(actor:Principal,...args:any[]){return this.port.lots(actor,...args);}
 createLot(actor:Principal,...args:any[]){return this.port.createLot(actor,...args);}
 blockLot(actor:Principal,...args:any[]){return this.port.blockLot(actor,...args);}
 manual(actor:Principal,...args:any[]){return this.port.manual(actor,...args);}
 movements(actor:Principal,...args:any[]){return this.port.movements(actor,...args);}
 movement(actor:Principal,...args:any[]){return this.port.movement(actor,...args);}
 valuation(actor:Principal,...args:any[]){return this.port.valuation(actor,...args);}
 expiry(actor:Principal,...args:any[]){return this.port.expiry(actor,...args);}
 reconciliation(actor:Principal,...args:any[]){return this.port.reconciliation(actor,...args);}
 createCount(actor:Principal,...args:any[]){return this.port.createCount(actor,...args);}
 count(actor:Principal,...args:any[]){return this.port.count(actor,...args);}
 cancelCount(actor:Principal,...args:any[]){return this.port.cancelCount(actor,...args);}
 confirmCount(actor:Principal,...args:any[]){return this.port.confirmCount(actor,...args);}
 createTransfer(actor:Principal,...args:any[]){return this.port.createTransfer(actor,...args);}
 transfer(actor:Principal,...args:any[]){return this.port.transfer(actor,...args);}
 cancelTransfer(actor:Principal,...args:any[]){return this.port.cancelTransfer(actor,...args);}
 dispatch(actor:Principal,...args:any[]){return this.port.dispatch(actor,...args);}
 receive(actor:Principal,...args:any[]){return this.port.receive(actor,...args);}
}
