import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {SupplyRepositoryPort} from './ports/supply.repository.port.js';
import type {SupplyQueryDto,SupplyAvailabilityDto,SupplyRequestDto,SupplySendDto,
 SupplyPurchaseDraftDto,SupplyImmediateDto,SupplyReceiveDto,SupplyCancelDto} from './contracts/supply.types.js';
@Injectable()
export class SupplyService{
 constructor(private readonly repository:SupplyRepositoryPort){}
 list(u:Principal,q:SupplyQueryDto){return this.repository.list(u,q)}
 detail(u:Principal,id:string){return this.repository.detail(u,id)}
 create(u:Principal,d:SupplyRequestDto){return this.repository.create(u,d)}
 availability(u:Principal,id:string,q:SupplyAvailabilityDto){return this.repository.availability(u,id,q)}
 purchaseDraft(u:Principal,id:string,d:SupplyPurchaseDraftDto){return this.repository.purchaseDraft(u,id,d)}
 send(u:Principal,id:string,d:SupplySendDto){return this.repository.send(u,id,d)}
 immediate(u:Principal,d:SupplyImmediateDto){return this.repository.immediate(u,d)}
 transfer(u:Principal,id:string){return this.repository.transfer(u,id)}
 receive(u:Principal,id:string,d:SupplyReceiveDto){return this.repository.receive(u,id,d)}
 cancel(u:Principal,id:string,d:SupplyCancelDto){return this.repository.cancel(u,id,d)}
}
