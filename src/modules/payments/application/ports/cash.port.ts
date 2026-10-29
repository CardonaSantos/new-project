import type {Principal} from '../../../auth/application/auth.service.js';

/** Cash application port, keeping cash and settlement transactions behind the adapter. */
export abstract class CashPort{
 abstract registers(actor:Principal,...args:any[]):Promise<any>;
 abstract create(actor:Principal,...args:any[]):Promise<any>;
 abstract update(actor:Principal,...args:any[]):Promise<any>;
 abstract open(actor:Principal,...args:any[]):Promise<any>;
 abstract detail(actor:Principal,...args:any[]):Promise<any>;
 abstract list(actor:Principal,...args:any[]):Promise<any>;
 abstract movement(actor:Principal,...args:any[]):Promise<any>;
 abstract close(actor:Principal,...args:any[]):Promise<any>;
}
