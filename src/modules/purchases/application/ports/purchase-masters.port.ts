import {Principal} from '../../../auth/application/auth.service.js';

/** Public application contract: Prisma remains owned by the infrastructure adapter. */
export abstract class PurchaseMastersPort {
 abstract suppliers(u:Principal,...args:any[]):Promise<any>;
 abstract supplier(u:Principal,...args:any[]):Promise<any>;
 abstract createSupplier(u:Principal,...args:any[]):Promise<any>;
 abstract updateSupplier(u:Principal,...args:any[]):Promise<any>;
 abstract status(u:Principal,...args:any[]):Promise<any>;
 abstract presentations(u:Principal,...args:any[]):Promise<any>;
 abstract createPresentation(u:Principal,...args:any[]):Promise<any>;
 abstract presentationStatus(u:Principal,...args:any[]):Promise<any>;
}
