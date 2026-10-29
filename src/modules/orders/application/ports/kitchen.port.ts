import type {Principal} from '../../../auth/application/auth.service.js';

/** Kitchen use-case contract: infrastructure-independent application port. */
export abstract class KitchenPort {
 abstract stations(actor:Principal,...args:any[]):Promise<any>;
 abstract createStation(actor:Principal,...args:any[]):Promise<any>;
 abstract updateStation(actor:Principal,...args:any[]):Promise<any>;
 abstract routes(actor:Principal,...args:any[]):Promise<any>;
 abstract route(actor:Principal,...args:any[]):Promise<any>;
 abstract editRoute(actor:Principal,...args:any[]):Promise<any>;
 abstract removeRoute(actor:Principal,...args:any[]):Promise<any>;
 abstract changes(actor:Principal,...args:any[]):Promise<any>;
 abstract list(actor:Principal,...args:any[]):Promise<any>;
 abstract detail(actor:Principal,...args:any[]):Promise<any>;
 abstract start(actor:Principal,...args:any[]):Promise<any>;
 abstract startLine(actor:Principal,...args:any[]):Promise<any>;
 abstract readyLine(actor:Principal,...args:any[]):Promise<any>;
 abstract ready(actor:Principal,...args:any[]):Promise<any>;
 abstract deliver(actor:Principal,...args:any[]):Promise<any>;
}
