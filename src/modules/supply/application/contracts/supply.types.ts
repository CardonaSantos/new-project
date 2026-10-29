import type {PurchaseOrderDto} from '../../../purchases/presentation/http/dto/purchases.dto.js';
export interface SupplyQueryDto {sucursalId:string;page:number;limit:number}
export interface SupplyKeyDto {claveOperacion:string}
export interface SupplyRequestLineDto {articuloId:string;cantidadSolicitada:string}
export interface SupplyRequestDto extends SupplyKeyDto {
 almacenDestinoId:string;nota?:string;lineas:SupplyRequestLineDto[]
}
export interface SupplyAvailabilityDto {almacenOrigenId:string}
export interface SupplyPurchaseDraftDto extends SupplyKeyDto {orden:PurchaseOrderDto}
export interface SupplySendLineDto {articuloId:string;ubicacionOrigenId:string;ubicacionDestinoId:string;loteId?:string;cantidad:string}
export interface SupplySendDto extends SupplyKeyDto {
 almacenOrigenId:string;inmediato?:boolean;nota?:string;lineas:SupplySendLineDto[]
}
export interface SupplyImmediateDto extends SupplySendDto {almacenDestinoId:string}
export interface SupplyReceiveLineDto {transferenciaLineaId:string;cantidadRecibida:string}
export interface SupplyReceiveDto extends SupplyKeyDto {observaciones?:string;lineas:SupplyReceiveLineDto[]}
export interface SupplyCancelDto extends SupplyKeyDto {motivo:string}
