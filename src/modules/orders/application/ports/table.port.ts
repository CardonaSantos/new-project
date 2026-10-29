import type {Principal} from '../../../auth/application/auth.service.js';

/** Table use-case contract: infrastructure-independent application port. */
export abstract class TablePort {
 abstract rooms(actor:Principal,...args:any[]):Promise<any>;
 abstract createRoom(actor:Principal,...args:any[]):Promise<any>;
 abstract updateRoom(actor:Principal,...args:any[]):Promise<any>;
 abstract list(actor:Principal,...args:any[]):Promise<any>;
 abstract createTable(actor:Principal,...args:any[]):Promise<any>;
 abstract close(actor:Principal,...args:any[]):Promise<any>;
 abstract updateTable(actor:Principal,...args:any[]):Promise<any>;
}
