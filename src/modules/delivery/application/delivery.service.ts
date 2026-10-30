import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {DeliveryPort} from './ports/delivery.port.js';
import type {DeliveryAction,DeliveryCancel,DeliveryAssign,DeliveryCreate,DeliveryDestination,DeliveryQuery}
 from './ports/delivery.port.js';

@Injectable()
export class DeliveryService{
 constructor(private readonly port:DeliveryPort){}
 list(u:Principal,q:DeliveryQuery){return this.port.list(u,q);}
 detail(u:Principal,id:string){return this.port.detail(u,id);}
 events(u:Principal,id:string){return this.port.events(u,id);}
 closureReadiness(u:Principal,id:string){return this.port.closureReadiness(u,id);}
 finalizeOrder(u:Principal,id:string){return this.port.finalizeOrder(u,id);}
 create(u:Principal,d:DeliveryCreate){return this.port.create(u,d);}
 destination(u:Principal,id:string,d:DeliveryDestination){return this.port.destination(u,id,d);}
 assign(u:Principal,id:string,d:DeliveryAssign){return this.port.assign(u,id,d);}
 dispatch(u:Principal,id:string,d:DeliveryAction){return this.port.dispatch(u,id,d);}
 complete(u:Principal,id:string,d:DeliveryAction){return this.port.complete(u,id,d);}
 cancel(u:Principal,id:string,d:DeliveryCancel){return this.port.cancel(u,id,d);}
}
