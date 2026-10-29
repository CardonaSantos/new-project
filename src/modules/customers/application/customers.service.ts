import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {CustomersPort} from './ports/customers.port.js';
import type {BranchCommand,CustomerQuery,CustomerCreate,CustomerUpdate,AddressCreate,AddressUpdate}
 from './ports/customers.port.js';

@Injectable()
export class CustomersService{
 constructor(private readonly port:CustomersPort){}
 list(a:Principal,q:CustomerQuery){return this.port.list(a,q);}
 detail(a:Principal,id:string,s:string){return this.port.detail(a,id,s);}
 create(a:Principal,d:CustomerCreate){return this.port.create(a,d);}
 update(a:Principal,id:string,d:CustomerUpdate){return this.port.update(a,id,d);}
 deactivate(a:Principal,id:string,d:BranchCommand&{motivo:string}){return this.port.deactivate(a,id,d);}
 addresses(a:Principal,id:string,s:string){return this.port.addresses(a,id,s);}
 addAddress(a:Principal,id:string,d:AddressCreate){return this.port.addAddress(a,id,d);}
 updateAddress(a:Principal,id:string,addressId:string,d:AddressUpdate){return this.port.updateAddress(a,id,addressId,d);}
 setPrimary(a:Principal,id:string,addressId:string,d:BranchCommand){return this.port.setPrimary(a,id,addressId,d);}
 deactivateAddress(a:Principal,id:string,addressId:string,d:BranchCommand){return this.port.deactivateAddress(a,id,addressId,d);}
}
