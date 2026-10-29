import type {Principal} from '../../../auth/application/auth.service.js';
/** FIN-A owns external ledger postings; DEL-A shares its existing transaction. */
export abstract class PlatformLedgerPort{
 abstract postNetInTx(transaction:unknown,actor:Principal,input:{
  sucursalId:string;cuentaFinancieraId:string;liquidacionId:string;monto:string
 }):Promise<{movimientoId:string;cuentaFinancieraId:string;monto:string}>;
}
