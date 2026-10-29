import type {Principal} from '../../../auth/application/auth.service.js';

/** Inventory use-case contract. Stock/valuation remains in the existing Prisma adapter. */
export abstract class InventoryOperationsPort {
 abstract stock(actor:Principal,...args:any[]):Promise<any>;
 abstract summary(actor:Principal,...args:any[]):Promise<any>;
 abstract lots(actor:Principal,...args:any[]):Promise<any>;
 abstract createLot(actor:Principal,...args:any[]):Promise<any>;
 abstract blockLot(actor:Principal,...args:any[]):Promise<any>;
 abstract manual(actor:Principal,...args:any[]):Promise<any>;
 abstract movements(actor:Principal,...args:any[]):Promise<any>;
 abstract movement(actor:Principal,...args:any[]):Promise<any>;
 abstract valuation(actor:Principal,...args:any[]):Promise<any>;
 abstract expiry(actor:Principal,...args:any[]):Promise<any>;
 abstract reconciliation(actor:Principal,...args:any[]):Promise<any>;
 abstract createCount(actor:Principal,...args:any[]):Promise<any>;
 abstract count(actor:Principal,...args:any[]):Promise<any>;
 abstract cancelCount(actor:Principal,...args:any[]):Promise<any>;
 abstract confirmCount(actor:Principal,...args:any[]):Promise<any>;
 abstract createTransfer(actor:Principal,...args:any[]):Promise<any>;
 abstract transfer(actor:Principal,...args:any[]):Promise<any>;
 abstract cancelTransfer(actor:Principal,...args:any[]):Promise<any>;
 abstract dispatch(actor:Principal,...args:any[]):Promise<any>;
 abstract receive(actor:Principal,...args:any[]):Promise<any>;
}
