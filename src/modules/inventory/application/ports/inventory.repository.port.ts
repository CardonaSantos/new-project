import type {ArticleKind,Dimension} from '../../domain/inventory.policy.js';
export interface Page {page:number;limit:number;search?:string;activo?:boolean}
export interface Scope {global:boolean;branchIds:string[]}
export interface Unit {id:string;codigo:string;nombre:string;dimension:Dimension;esBase:boolean}
export interface ArticleInput {codigo:string;nombre:string;tipo:ArticleKind;unidadBaseId:string;
 requiereLote?:boolean;requiereVencimiento?:boolean;costoReferencia?:string|null;
 stockMinimo?:string|null}
export interface ArticleUpdate {nombre?:string;requiereLote?:boolean;requiereVencimiento?:boolean;
 costoReferencia?:string|null;stockMinimo?:string|null}
export interface WarehouseInput {sucursalId:string;codigo:string;nombre:string}
export interface LocationInput {almacenId:string;codigo:string;nombre:string;esRecepcion?:boolean}
export interface ArticleFilter extends Page {tipo?:ArticleKind;sucursalId?:string}
export interface WarehouseFilter extends Page {sucursalId?:string}
export interface LocationFilter extends Page {almacenId?:string;sucursalId?:string;esRecepcion?:boolean}
export interface Options {search?:string;cursor?:string;limit:number}
export interface ResultPage<T> {data:T[];total:number}
export interface OptionPage<T> {data:T[];nextCursor:string|null}
export abstract class InventoryRepositoryPort {
 abstract scope(userId:string,permission:string):Promise<Scope>;
 abstract listUnits(f:Page):Promise<ResultPage<Unit>>;
 abstract unitOptions(f:Options&{dimension?:Dimension}):Promise<OptionPage<Unit>>;
 abstract getUnit(id:string):Promise<Unit|null>;
 abstract createUnit(userId:string,input:{codigo:string;nombre:string;dimension:Dimension;esBase:boolean}):Promise<Unit>;
 abstract updateUnit(userId:string,id:string,name:string):Promise<Unit>;
 abstract listConversions(f:Page&{dimension?:Dimension}):Promise<ResultPage<unknown>>;
 abstract convert(originId:string,destId:string,amount:string):Promise<{origen:Unit;destino:Unit;cantidadOrigen:string;factor:string;cantidadDestino:string}>;
 abstract createConversion(userId:string,input:{unidadOrigenId:string;unidadDestinoId:string;factor:string}):Promise<unknown>;
 abstract listArticles(f:ArticleFilter):Promise<ResultPage<unknown>>;
 abstract articleOptions(f:Options&{tipo?:ArticleKind}):Promise<OptionPage<unknown>>;
 abstract getArticle(id:string):Promise<unknown|null>;
 abstract createArticle(userId:string,input:ArticleInput):Promise<unknown>;
 abstract updateArticle(userId:string,id:string,input:ArticleUpdate):Promise<unknown>;
 abstract articleStatus(userId:string,id:string,activo:boolean,motivo:string):Promise<unknown>;
 abstract dependencies(id:string):Promise<unknown>;
 abstract articleMedia(userId:string,id:string,mediaIds:string[]):Promise<unknown>;
 abstract listWarehouses(f:WarehouseFilter,scope:Scope):Promise<ResultPage<unknown>>;
 abstract warehouseOptions(f:Options&{sucursalId?:string},scope:Scope):Promise<OptionPage<unknown>>;
 abstract getWarehouse(id:string):Promise<{id:string;sucursalId:string;[key:string]:unknown}|null>;
 abstract createWarehouse(userId:string,input:WarehouseInput):Promise<unknown>;
 abstract updateWarehouse(userId:string,id:string,input:{nombre:string}):Promise<unknown>;
 abstract warehouseStatus(userId:string,id:string,activo:boolean,motivo:string):Promise<unknown>;
 abstract listLocations(f:LocationFilter,scope:Scope):Promise<ResultPage<unknown>>;
 abstract locationOptions(f:Options&{almacenId?:string;sucursalId?:string},scope:Scope):Promise<OptionPage<unknown>>;
 abstract getLocation(id:string):Promise<{id:string;sucursalId:string;[key:string]:unknown}|null>;
 abstract createLocation(userId:string,input:LocationInput):Promise<unknown>;
 abstract updateLocation(userId:string,id:string,input:{nombre?:string;esRecepcion?:boolean}):Promise<unknown>;
 abstract locationStatus(userId:string,id:string,activo:boolean,motivo:string):Promise<unknown>;
 abstract overview(scope:Scope,sucursalId?:string):Promise<unknown>;
}
