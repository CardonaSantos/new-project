import type {Principal} from '../../../auth/application/auth.service.js';
import type {DeliveryState} from '../../domain/delivery.policy.js';

export type DeliveryQuery={
 sucursalId:string;page:number;limit:number;estado?:DeliveryState;repartidorId?:string
};
export type DeliveryCreate={
 ordenId:string;claveOperacion:string;direccionId?:string;
 direccionTexto?:string;referenciaDireccion?:string|null;telefonoContacto?:string|null;
 repartidorId?:string;canalExternoId?:string;referenciaExterna?:string|null
};
export type DeliveryAssign={repartidorId:string;claveOperacion:string};
export type DeliveryDestination={
 claveOperacion:string;direccionId?:string;direccionTexto?:string;
 referenciaDireccion?:string|null;telefonoContacto?:string|null
};
export type DeliveryAction={claveOperacion:string};
export type DeliveryCancel=DeliveryAction&{motivo:string};

export abstract class DeliveryPort{
 abstract list(actor:Principal,query:DeliveryQuery):Promise<unknown>;
 abstract detail(actor:Principal,id:string):Promise<unknown>;
 abstract events(actor:Principal,id:string):Promise<unknown>;
 abstract create(actor:Principal,input:DeliveryCreate):Promise<unknown>;
 abstract destination(actor:Principal,id:string,input:DeliveryDestination):Promise<unknown>;
 abstract assign(actor:Principal,id:string,input:DeliveryAssign):Promise<unknown>;
 abstract dispatch(actor:Principal,id:string,input:DeliveryAction):Promise<unknown>;
 abstract complete(actor:Principal,id:string,input:DeliveryAction):Promise<unknown>;
 abstract cancel(actor:Principal,id:string,input:DeliveryCancel):Promise<unknown>;
}
