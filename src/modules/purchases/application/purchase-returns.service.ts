import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PurchaseReturnsPort} from './ports/purchase-returns.port.js';

/** Stable use-case boundary, retaining existing business transaction semantics. */
@Injectable()
export class PurchaseReturnsService {
 constructor(private readonly port:PurchaseReturnsPort){}
 returns(u:Principal,...args:any[]){return this.port.returns(u,...args);}
 returnDetail(u:Principal,...args:any[]){return this.port.returnDetail(u,...args);}
 createReturn(u:Principal,...args:any[]){return this.port.createReturn(u,...args);}
 confirmReturn(u:Principal,...args:any[]){return this.port.confirmReturn(u,...args);}
 cancelReturn(u:Principal,...args:any[]){return this.port.cancelReturn(u,...args);}
 credits(u:Principal,...args:any[]){return this.port.credits(u,...args);}
 creditDetail(u:Principal,...args:any[]){return this.port.creditDetail(u,...args);}
 createCredit(u:Principal,...args:any[]){return this.port.createCredit(u,...args);}
 confirmCredit(u:Principal,...args:any[]){return this.port.confirmCredit(u,...args);}
 cancelCredit(u:Principal,...args:any[]){return this.port.cancelCredit(u,...args);}
 applyCredit(u:Principal,...args:any[]){return this.port.applyCredit(u,...args);}
 createSupplierRefund(u:Principal,...args:any[]){return this.port.createSupplierRefund(u,...args);}
 rejectSupplierRefund(u:Principal,...args:any[]){return this.port.rejectSupplierRefund(u,...args);}
 confirmSupplierRefund(u:Principal,...args:any[]){return this.port.confirmSupplierRefund(u,...args);}
}
