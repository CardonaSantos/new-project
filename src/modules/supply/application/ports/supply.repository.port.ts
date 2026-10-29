import type {Principal} from '../../../auth/application/auth.service.js';
import type {SupplyQueryDto,SupplyAvailabilityDto,SupplyRequestDto,SupplySendDto,
 SupplyPurchaseDraftDto,SupplyImmediateDto,SupplyReceiveDto,SupplyCancelDto} from '../contracts/supply.types.js';
export abstract class SupplyRepositoryPort {
 abstract list(u:Principal,q:SupplyQueryDto):Promise<any>;
 abstract detail(u:Principal,id:string):Promise<any>;
 abstract create(u:Principal,d:SupplyRequestDto):Promise<any>;
 abstract availability(u:Principal,id:string,q:SupplyAvailabilityDto):Promise<any>;
 abstract purchaseDraft(u:Principal,id:string,d:SupplyPurchaseDraftDto):Promise<any>;
 abstract send(u:Principal,id:string,d:SupplySendDto):Promise<any>;
 abstract immediate(u:Principal,d:SupplyImmediateDto):Promise<any>;
 abstract transfer(u:Principal,id:string):Promise<any>;
 abstract receive(u:Principal,id:string,d:SupplyReceiveDto):Promise<any>;
 abstract cancel(u:Principal,id:string,d:SupplyCancelDto):Promise<any>;
}
