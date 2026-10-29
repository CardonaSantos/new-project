import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {CashPort} from './ports/cash.port.js';

@Injectable()
export class CashService {
 constructor(private readonly port:CashPort){}
 registers(actor:Principal,...args:any[]){return this.port.registers(actor,...args);}
 create(actor:Principal,...args:any[]){return this.port.create(actor,...args);}
 update(actor:Principal,...args:any[]){return this.port.update(actor,...args);}
 open(actor:Principal,...args:any[]){return this.port.open(actor,...args);}
 detail(actor:Principal,...args:any[]){return this.port.detail(actor,...args);}
 list(actor:Principal,...args:any[]){return this.port.list(actor,...args);}
 movement(actor:Principal,...args:any[]){return this.port.movement(actor,...args);}
 close(actor:Principal,...args:any[]){return this.port.close(actor,...args);}
}
