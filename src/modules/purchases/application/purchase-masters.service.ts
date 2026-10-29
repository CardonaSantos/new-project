import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PurchaseMastersPort} from './ports/purchase-masters.port.js';

/** Stable use-case boundary, retaining existing business transaction semantics. */
@Injectable()
export class PurchaseMastersService {
 constructor(private readonly port:PurchaseMastersPort){}
 suppliers(u:Principal,...args:any[]){return this.port.suppliers(u,...args);}
 supplier(u:Principal,...args:any[]){return this.port.supplier(u,...args);}
 createSupplier(u:Principal,...args:any[]){return this.port.createSupplier(u,...args);}
 updateSupplier(u:Principal,...args:any[]){return this.port.updateSupplier(u,...args);}
 status(u:Principal,...args:any[]){return this.port.status(u,...args);}
 presentations(u:Principal,...args:any[]){return this.port.presentations(u,...args);}
 createPresentation(u:Principal,...args:any[]){return this.port.createPresentation(u,...args);}
 presentationStatus(u:Principal,...args:any[]){return this.port.presentationStatus(u,...args);}
}
