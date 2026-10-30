import type {Principal} from '../../../auth/application/auth.service.js';

export type Page={sucursalId:string;page:number;limit:number};
export type CourierPending=Page&{repartidorId?:string};
export type CourierCashInput={cuentaId:string;monto:string;claveOperacion:string};
export type CourierSettlementCreate={sucursalId:string;repartidorId:string;pagoIds:string[];claveOperacion:string};
export type CourierSettlementClose={turnoCajaId:string;totalEntregado:string;claveOperacion:string};
/** Single-step standard handover; the two-step path remains available for incidents. */
export type CourierSettlementDirect=CourierSettlementCreate&{turnoCajaId:string;totalEntregado:string};
export type PlatformLineInput={entregaId:string;cuentaId:string;importeBruto:string;comision:string};
export type PlatformSettlementCreate={
 sucursalId:string;canalId:string;cuentaFinancieraId:string;periodoInicio:string;periodoFin:string;
 referencia:string;lineas:PlatformLineInput[];claveOperacion:string;
};
export type PlatformChannelCreate={sucursalId:string;codigo:string;nombre:string;claveOperacion:string};
export type CourierDiscrepancy={montoDeclarado:string;motivo:string;claveOperacion:string};
export abstract class DeliverySettlementsPort{
 abstract cash(actor:Principal,entregaId:string,input:CourierCashInput):Promise<unknown>;
 abstract pending(actor:Principal,q:CourierPending):Promise<unknown>;
 abstract createCourier(actor:Principal,d:CourierSettlementCreate):Promise<unknown>;
 abstract closeCourier(actor:Principal,id:string,d:CourierSettlementClose):Promise<unknown>;
 abstract closeCourierDirect(actor:Principal,d:CourierSettlementDirect):Promise<unknown>;
 abstract discrepancy(actor:Principal,id:string,d:CourierDiscrepancy):Promise<unknown>;
 abstract courierDetail(actor:Principal,id:string):Promise<unknown>;
 abstract platformChannels(actor:Principal,sucursalId:string):Promise<unknown>;
 abstract registerChannel(actor:Principal,d:PlatformChannelCreate):Promise<unknown>;
 abstract createPlatform(actor:Principal,d:PlatformSettlementCreate):Promise<unknown>;
 abstract platformDetail(actor:Principal,id:string):Promise<unknown>;
}
