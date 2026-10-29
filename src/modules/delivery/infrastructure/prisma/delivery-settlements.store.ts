import {Injectable} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DeliverySettlementsPort} from '../../application/ports/delivery-settlements.port.js';
import type {CourierCashInput,CourierPending,CourierSettlementCreate,CourierSettlementClose,CourierDiscrepancy,
 PlatformSettlementCreate} from '../../application/ports/delivery-settlements.port.js';
import {CourierSettlementsStore} from './courier-settlements.store.js';
import {PlatformSettlementsStore} from './platform-settlements.store.js';

@Injectable()
export class DeliverySettlementsStore extends DeliverySettlementsPort{
 constructor(private readonly courier:CourierSettlementsStore,
  private readonly platform:PlatformSettlementsStore){super();}
 cash(u:Principal,id:string,d:CourierCashInput){return this.courier.cash(u,id,d);}
 pending(u:Principal,q:CourierPending){return this.courier.pending(u,q);}
 createCourier(u:Principal,d:CourierSettlementCreate){return this.courier.create(u,d);}
 closeCourier(u:Principal,id:string,d:CourierSettlementClose){return this.courier.close(u,id,d);}
 discrepancy(u:Principal,id:string,d:CourierDiscrepancy){return this.courier.discrepancy(u,id,d);}
 courierDetail(u:Principal,id:string){return this.courier.detail(u,id);}
 platformChannels(u:Principal,branch:string){return this.platform.channels(u,branch);}
 registerChannel(u:Principal,d:import('../../application/ports/delivery-settlements.port.js').PlatformChannelCreate){
  return this.platform.registerChannel(u,d);
 }
 createPlatform(u:Principal,d:PlatformSettlementCreate){return this.platform.create(u,d);}
 platformDetail(u:Principal,id:string){return this.platform.detail(u,id);}
}
