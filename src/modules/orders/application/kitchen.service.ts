import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {KitchenPort} from './ports/kitchen.port.js';

@Injectable()
export class KitchenService {
 constructor(private readonly port:KitchenPort){}
 stations(actor:Principal,...args:any[]){return this.port.stations(actor,...args);}
 createStation(actor:Principal,...args:any[]){return this.port.createStation(actor,...args);}
 updateStation(actor:Principal,...args:any[]){return this.port.updateStation(actor,...args);}
 routes(actor:Principal,...args:any[]){return this.port.routes(actor,...args);}
 route(actor:Principal,...args:any[]){return this.port.route(actor,...args);}
 editRoute(actor:Principal,...args:any[]){return this.port.editRoute(actor,...args);}
 removeRoute(actor:Principal,...args:any[]){return this.port.removeRoute(actor,...args);}
 changes(actor:Principal,...args:any[]){return this.port.changes(actor,...args);}
 list(actor:Principal,...args:any[]){return this.port.list(actor,...args);}
 detail(actor:Principal,...args:any[]){return this.port.detail(actor,...args);}
 start(actor:Principal,...args:any[]){return this.port.start(actor,...args);}
 startLine(actor:Principal,...args:any[]){return this.port.startLine(actor,...args);}
 readyLine(actor:Principal,...args:any[]){return this.port.readyLine(actor,...args);}
 ready(actor:Principal,...args:any[]){return this.port.ready(actor,...args);}
 deliver(actor:Principal,...args:any[]){return this.port.deliver(actor,...args);}
}
