import {Injectable} from '@nestjs/common';
import {OrderStore} from '../infrastructure/order.store.js';
import type {Principal} from '../../auth/application/auth.service.js';
import type {OrderCreateDto,AddLinesDto,OrderPageDto,KitchenPageDto,StationDto,RouteDto,TableOpenDto} from '../presentation/dto/order.dto.js';
@Injectable()
export class OrdersService{
 constructor(private readonly store:OrderStore){}
 list(u:Principal,q:OrderPageDto){return this.store.list(u,q);}
 detail(u:Principal,id:string){return this.store.detail(u,id);}
 create(u:Principal,d:OrderCreateDto){return this.store.create(u,d);}
 add(u:Principal,id:string,d:AddLinesDto){return this.store.add(u,id,d);}
 dispatch(u:Principal,id:string){return this.store.dispatch(u,id);}
 cancel(u:Principal,id:string){return this.store.cancel(u,id);}
 kitchen(u:Principal,q:KitchenPageDto){return this.store.kitchen(u,q);}
 kitchenDetail(u:Principal,id:string){return this.store.kitchenDetail(u,id);}
 kitchenStart(u:Principal,id:string){return this.store.kitchenStart(u,id);}
 kitchenReady(u:Principal,id:string){return this.store.kitchenReady(u,id);}
 kitchenCancel(u:Principal,id:string){return this.store.kitchenCancel(u,id);}
 stations(u:Principal,branch:string){return this.store.stations(u,branch);}
 stationCreate(u:Principal,d:StationDto){return this.store.stationCreate(u,d);}
 routeCreate(u:Principal,d:RouteDto){return this.store.routeCreate(u,d);}
 tables(u:Principal,branch:string){return this.store.tables(u,branch);}
 tableOpen(u:Principal,d:TableOpenDto){return this.store.tableOpen(u,d);}
 tableClose(u:Principal,id:string){return this.store.tableClose(u,id);}
}
