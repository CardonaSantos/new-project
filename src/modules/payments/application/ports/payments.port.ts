import type {Principal} from '../../../auth/application/auth.service.js';

/** Payments application port, keeping cash and settlement transactions behind the adapter. */
export abstract class PaymentsPort{
 abstract account(actor:Principal,...args:any[]):Promise<any>;
 abstract accounts(actor:Principal,...args:any[]):Promise<any>;
 abstract finalize(actor:Principal,...args:any[]):Promise<any>;
 abstract settle(actor:Principal,...args:any[]):Promise<any>;
 abstract collect(actor:Principal,...args:any[]):Promise<any>;
 abstract confirm(actor:Principal,...args:any[]):Promise<any>;
 abstract cancelAttempt(actor:Principal,...args:any[]):Promise<any>;
 abstract refund(actor:Principal,...args:any[]):Promise<any>;
 abstract sale(actor:Principal,...args:any[]):Promise<any>;
 abstract paymentSummary(actor:Principal,...args:any[]):Promise<any>;
 abstract sales(actor:Principal,...args:any[]):Promise<any>;
 abstract split(actor:Principal,...args:any[]):Promise<any>;
 abstract splitEqual(actor:Principal,...args:any[]):Promise<any>;
}
