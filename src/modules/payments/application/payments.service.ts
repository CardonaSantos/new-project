import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {PaymentsPort} from './ports/payments.port.js';

@Injectable()
export class PaymentsService {
 constructor(private readonly port:PaymentsPort){}
 account(actor:Principal,...args:any[]){return this.port.account(actor,...args);}
 accounts(actor:Principal,...args:any[]){return this.port.accounts(actor,...args);}
 finalize(actor:Principal,...args:any[]){return this.port.finalize(actor,...args);}
 settle(actor:Principal,...args:any[]){return this.port.settle(actor,...args);}
 collect(actor:Principal,...args:any[]){return this.port.collect(actor,...args);}
 confirm(actor:Principal,...args:any[]){return this.port.confirm(actor,...args);}
 cancelAttempt(actor:Principal,...args:any[]){return this.port.cancelAttempt(actor,...args);}
 refund(actor:Principal,...args:any[]){return this.port.refund(actor,...args);}
 sale(actor:Principal,...args:any[]){return this.port.sale(actor,...args);}
 paymentSummary(actor:Principal,...args:any[]){return this.port.paymentSummary(actor,...args);}
 sales(actor:Principal,...args:any[]){return this.port.sales(actor,...args);}
 split(actor:Principal,...args:any[]){return this.port.split(actor,...args);}
 splitEqual(actor:Principal,...args:any[]){return this.port.splitEqual(actor,...args);}
}
