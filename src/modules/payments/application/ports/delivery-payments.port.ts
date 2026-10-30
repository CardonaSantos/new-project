import type {Principal} from '../../../auth/application/auth.service.js';

/** PAY-A is the only owner of Pago; consumers supply their existing transaction. */
export abstract class DeliveryPaymentsPort{
 abstract collectCourierCashInTx(transaction:unknown,actor:Principal,input:{
  entregaId:string;cuentaId:string;monto:string
 }):Promise<{pagoId:string;cuentaId:string;monto:string}>;
 abstract collectPlatformGrossInTx(transaction:unknown,actor:Principal,input:{
  entregaId:string;cuentaId:string;monto:string;liquidacionId:string
 }):Promise<{pagoId:string;cuentaId:string;monto:string}>;
}
