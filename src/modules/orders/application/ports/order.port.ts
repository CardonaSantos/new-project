import type {Principal} from '../../../auth/application/auth.service.js';

/** Order use-case contract: infrastructure-independent application port. */
export abstract class OrderPort {
 abstract detail(actor:Principal,...args:any[]):Promise<any>;
 abstract list(actor:Principal,...args:any[]):Promise<any>;
 abstract create(actor:Principal,...args:any[]):Promise<any>;
 abstract edit(actor:Principal,...args:any[]):Promise<any>;
 abstract add(actor:Principal,...args:any[]):Promise<any>;
 abstract editLine(actor:Principal,...args:any[]):Promise<any>;
 abstract cancelLine(actor:Principal,...args:any[]):Promise<any>;
 abstract send(actor:Principal,...args:any[]):Promise<any>;
 abstract cancel(actor:Principal,...args:any[]):Promise<any>;
 abstract close(actor:Principal,...args:any[]):Promise<any>;
}
