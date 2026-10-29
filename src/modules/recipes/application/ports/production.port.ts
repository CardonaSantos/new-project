import type {Principal} from '../../../auth/application/auth.service.js';
/** Port for ProductionStore, isolating recipe application from Prisma internals. */
export abstract class ProductionStorePort {
 abstract preview(actor:Principal,...args:any[]):Promise<any>;
 abstract list(actor:Principal,...args:any[]):Promise<any>;
 abstract detail(actor:Principal,...args:any[]):Promise<any>;
 abstract draft(actor:Principal,...args:any[]):Promise<any>;
 abstract confirm(actor:Principal,...args:any[]):Promise<any>;
 abstract execute(actor:Principal,...args:any[]):Promise<any>;
 abstract cancel(actor:Principal,...args:any[]):Promise<any>;
 abstract report(actor:Principal,...args:any[]):Promise<any>;
}
