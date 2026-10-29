import type {Principal} from '../../../auth/application/auth.service.js';

export type BranchCommand={sucursalId:string;claveOperacion:string};
export type CustomerQuery={sucursalId:string;page:number;limit:number;search?:string;activo?:boolean};
export type CustomerOptionsQuery={sucursalId:string;limit:number;search?:string;cursor?:string};
export type CustomerCreate=BranchCommand&{nombre:string;nit?:string|null;telefono?:string|null;email?:string|null;notas?:string|null};
export type CustomerUpdate=BranchCommand&{nombre?:string;nit?:string|null;telefono?:string|null;email?:string|null;notas?:string|null};
export type AddressCreate=BranchCommand&{alias?:string|null;direccion:string;referencia?:string|null;latitud?:string|null;longitud?:string|null;principal?:boolean};
export type AddressUpdate=BranchCommand&{alias?:string|null;direccion?:string;referencia?:string|null;latitud?:string|null;longitud?:string|null};

export abstract class CustomersPort{
 abstract list(actor:Principal,q:CustomerQuery):Promise<unknown>;
 abstract options(actor:Principal,q:CustomerOptionsQuery):Promise<unknown>;
 abstract detail(actor:Principal,id:string,sucursalId:string):Promise<unknown>;
 abstract create(actor:Principal,command:CustomerCreate):Promise<unknown>;
 abstract update(actor:Principal,id:string,command:CustomerUpdate):Promise<unknown>;
 abstract deactivate(actor:Principal,id:string,command:BranchCommand&{motivo:string}):Promise<unknown>;
 abstract addresses(actor:Principal,id:string,sucursalId:string):Promise<unknown>;
 abstract addAddress(actor:Principal,id:string,command:AddressCreate):Promise<unknown>;
 abstract updateAddress(actor:Principal,id:string,addressId:string,command:AddressUpdate):Promise<unknown>;
 abstract setPrimary(actor:Principal,id:string,addressId:string,command:BranchCommand):Promise<unknown>;
 abstract deactivateAddress(actor:Principal,id:string,addressId:string,command:BranchCommand):Promise<unknown>;
}
// Public integration boundary. The transaction token is intentionally opaque:
// application code never imports Prisma, and infrastructure adapters share the
// ORD-A transaction to avoid detached read/write checks and TOCTOU races.
export abstract class CustomerSelectionPort{
 // Revalidate permissions/scope before idempotent replays; historic inactive
 // customers are still referencable for a previously committed order.
 abstract assertVisibleInTx(transaction:unknown,actorId:string,
  sucursalId:string,clienteId:string):Promise<void>;
 abstract assertSelectableInTx(transaction:unknown,actorId:string,
  sucursalId:string,clienteId:string):Promise<void>;
}
