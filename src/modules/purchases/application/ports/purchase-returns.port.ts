import {Principal} from '../../../auth/application/auth.service.js';

/** Public application contract: Prisma remains owned by the infrastructure adapter. */
export abstract class PurchaseReturnsPort {
 abstract returns(u:Principal,...args:any[]):Promise<any>;
 abstract returnDetail(u:Principal,...args:any[]):Promise<any>;
 abstract createReturn(u:Principal,...args:any[]):Promise<any>;
 abstract confirmReturn(u:Principal,...args:any[]):Promise<any>;
 abstract cancelReturn(u:Principal,...args:any[]):Promise<any>;
 abstract credits(u:Principal,...args:any[]):Promise<any>;
 abstract creditDetail(u:Principal,...args:any[]):Promise<any>;
 abstract createCredit(u:Principal,...args:any[]):Promise<any>;
 abstract confirmCredit(u:Principal,...args:any[]):Promise<any>;
 abstract cancelCredit(u:Principal,...args:any[]):Promise<any>;
 abstract applyCredit(u:Principal,...args:any[]):Promise<any>;
 abstract createSupplierRefund(u:Principal,...args:any[]):Promise<any>;
 abstract rejectSupplierRefund(u:Principal,...args:any[]):Promise<any>;
 abstract confirmSupplierRefund(u:Principal,...args:any[]):Promise<any>;
}
