import type {Principal} from '../../../auth/application/auth.service.js';

/** Public application contract: Prisma remains owned by the infrastructure adapter. */
export abstract class PurchaseReceiptsPort {
 abstract list(u:Principal,...args:any[]):Promise<any>;
 abstract detail(u:Principal,...args:any[]):Promise<any>;
 abstract create(u:Principal,...args:any[]):Promise<any>;
 abstract edit(u:Principal,...args:any[]):Promise<any>;
 abstract confirm(u:Principal,...args:any[]):Promise<any>;
 abstract cancel(u:Principal,...args:any[]):Promise<any>;
 abstract movements(u:Principal,...args:any[]):Promise<any>;
}
