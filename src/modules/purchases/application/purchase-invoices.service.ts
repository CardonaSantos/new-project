import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PurchaseInvoicesPort} from './ports/purchase-invoices.port.js';

/** Stable use-case boundary, retaining existing business transaction semantics. */
@Injectable()
export class PurchaseInvoicesService {
 constructor(private readonly port:PurchaseInvoicesPort){}
 list(u:Principal,...args:any[]){return this.port.list(u,...args);}
 detail(u:Principal,...args:any[]){return this.port.detail(u,...args);}
 create(u:Principal,...args:any[]){return this.port.create(u,...args);}
 confirm(u:Principal,...args:any[]){return this.port.confirm(u,...args);}
 cancel(u:Principal,...args:any[]){return this.port.cancel(u,...args);}
}
