import type {Principal} from '../../../auth/application/auth.service.js';

/** Inventory use-case contract. Stock/valuation remains in the existing Prisma adapter. */
export abstract class InventoryInternalConsumptionPort {
 abstract execute(actor:Principal,...args:any[]):Promise<any>;
}
