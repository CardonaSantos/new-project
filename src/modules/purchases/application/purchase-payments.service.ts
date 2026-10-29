import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PurchasePaymentsPort} from './ports/purchase-payments.port.js';

/** Stable use-case boundary, retaining existing business transaction semantics. */
@Injectable()
export class PurchasePaymentsService {
 constructor(private readonly port:PurchasePaymentsPort){}
 list(u:Principal,...args:any[]){return this.port.list(u,...args);}
 detail(u:Principal,...args:any[]){return this.port.detail(u,...args);}
 create(u:Principal,...args:any[]){return this.port.create(u,...args);}
 apply(u:Principal,...args:any[]){return this.port.apply(u,...args);}
 confirm(u:Principal,...args:any[]){return this.port.confirm(u,...args);}
 reject(u:Principal,...args:any[]){return this.port.reject(u,...args);}
}
