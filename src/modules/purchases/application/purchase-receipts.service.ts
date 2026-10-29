import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PurchaseReceiptsPort} from './ports/purchase-receipts.port.js';

/** Stable use-case boundary, retaining existing business transaction semantics. */
@Injectable()
export class PurchaseReceiptsService {
 constructor(private readonly port:PurchaseReceiptsPort){}
 list(u:Principal,...args:any[]){return this.port.list(u,...args);}
 detail(u:Principal,...args:any[]){return this.port.detail(u,...args);}
 create(u:Principal,...args:any[]){return this.port.create(u,...args);}
 edit(u:Principal,...args:any[]){return this.port.edit(u,...args);}
 confirm(u:Principal,...args:any[]){return this.port.confirm(u,...args);}
 cancel(u:Principal,...args:any[]){return this.port.cancel(u,...args);}
 movements(u:Principal,...args:any[]){return this.port.movements(u,...args);}
}
