import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {DeliverySettlementsPort} from './ports/delivery-settlements.port.js';
import type {CourierCashInput,CourierPending,CourierSettlementCreate,CourierSettlementClose,PlatformSettlementCreate}
 from './ports/delivery-settlements.port.js';

@Injectable()
export class DeliverySettlementsService{
 constructor(private readonly port:DeliverySettlementsPort){}
 cash(u:Principal,id:string,d:CourierCashInput){return this.port.cash(u,id,d);}
 pending(u:Principal,q:CourierPending){return this.port.pending(u,q);}
 createCourier(u:Principal,d:CourierSettlementCreate){return this.port.createCourier(u,d);}
 closeCourier(u:Principal,id:string,d:CourierSettlementClose){return this.port.closeCourier(u,id,d);}
 courierDetail(u:Principal,id:string){return this.port.courierDetail(u,id);}
 platformChannels(u:Principal,s:string){return this.port.platformChannels(u,s);}
 createPlatform(u:Principal,d:PlatformSettlementCreate){return this.port.createPlatform(u,d);}
 platformDetail(u:Principal,id:string){return this.port.platformDetail(u,id);}
}
