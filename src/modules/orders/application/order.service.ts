import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {OrderPort} from './ports/order.port.js';

@Injectable()
export class OrderService {
 constructor(private readonly port:OrderPort){}
 detail(actor:Principal,...args:any[]){return this.port.detail(actor,...args);}
 list(actor:Principal,...args:any[]){return this.port.list(actor,...args);}
 create(actor:Principal,...args:any[]){return this.port.create(actor,...args);}
 edit(actor:Principal,...args:any[]){return this.port.edit(actor,...args);}
 add(actor:Principal,...args:any[]){return this.port.add(actor,...args);}
 editLine(actor:Principal,...args:any[]){return this.port.editLine(actor,...args);}
 cancelLine(actor:Principal,...args:any[]){return this.port.cancelLine(actor,...args);}
 send(actor:Principal,...args:any[]){return this.port.send(actor,...args);}
 cancel(actor:Principal,...args:any[]){return this.port.cancel(actor,...args);}
 close(actor:Principal,...args:any[]){return this.port.close(actor,...args);}
}
