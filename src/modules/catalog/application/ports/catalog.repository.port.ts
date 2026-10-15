export interface CatalogScope{global:boolean;branchIds:string[]}
export interface Paging{page:number;limit:number;search?:string;activo?:boolean}
export interface Options{search?:string;cursor?:string;limit:number}
export interface Page<T=unknown>{data:T[];total:number}
export interface Choice<T=unknown>{data:T[];nextCursor:string|null}
export type CatalogKind='PREPARADO'|'INVENTARIABLE'|'SERVICIO';
export interface CategoryInput{nombre:string;parentId?:string|null;orden?:number}
export interface ProductInput{codigo:string;nombre:string;descripcion?:string|null;categoriaId?:string|null;tipo:CatalogKind;variantes?:Array<{nombre:string;sku?:string|null;articuloInventarioId?:string|null;orden?:number}>}
export interface VariantInput{nombre:string;sku?:string|null;articuloInventarioId?:string|null;orden?:number}
export interface GroupInput{nombre:string;minimo:number;maximo?:number|null}
export interface ModifierInput{grupoId:string;nombre:string;incrementoPrecio:string}
export interface PriceInput{entityId:string;sucursalId:string;importe:string;vigenteDesde:string;vigenteHasta?:string|null}
export interface MenuInput{codigo:string;nombre:string;descripcion?:string|null;sucursalIds:string[]}
export interface MenuLayout{
 expectedVersion:number;
 secciones:Array<{nombre:string;orden:number;items:Array<{varianteId:string;orden:number}>}>;
 horarios:Array<{diaSemana:number;desde:string;hasta:string}>;
 sucursalIds:string[];
}
export abstract class CatalogRepositoryPort{
 abstract scope(actorId:string,code:string):Promise<CatalogScope>;
 abstract categories(f:Paging):Promise<Page>;
 abstract categoryOptions(f:Options):Promise<Choice>;
 abstract categoryTree():Promise<unknown>;
 abstract category(id:string):Promise<unknown|null>;
 abstract createCategory(actorId:string,input:CategoryInput):Promise<unknown>;
 abstract updateCategory(actorId:string,id:string,input:Partial<CategoryInput>):Promise<unknown>;
 abstract statusCategory(actorId:string,id:string,activo:boolean,motivo:string):Promise<unknown>;
 abstract products(f:Paging&{categoriaId?:string;tipo?:CatalogKind}):Promise<Page>;
 abstract productOptions(f:Options&{sucursalId?:string}):Promise<Choice>;
 abstract product(id:string,sucursalId?:string):Promise<unknown|null>;
 abstract createProduct(actorId:string,input:ProductInput):Promise<unknown>;
 abstract updateProduct(actorId:string,id:string,input:Partial<Omit<ProductInput,'codigo'|'tipo'|'variantes'>>):Promise<unknown>;
 abstract statusProduct(actorId:string,id:string,activo:boolean,motivo:string):Promise<unknown>;
 abstract createVariant(actorId:string,productId:string,input:VariantInput):Promise<unknown>;
 abstract updateVariant(actorId:string,id:string,input:Partial<VariantInput>&{activo?:boolean}):Promise<unknown>;
 abstract variant(id:string,sucursalId?:string):Promise<unknown|null>;
 abstract variantOptions(f:Options&{productoId?:string;sucursalId?:string}):Promise<Choice>;
 abstract variantBranch(actorId:string,id:string,sucursalId:string,input:{habilitada:boolean;pausadaHasta?:string|null;motivo?:string|null}):Promise<unknown>;
 abstract modifierGroups(f:Paging):Promise<Page>;
 abstract groupOptions(f:Options):Promise<Choice>;
 abstract createGroup(actorId:string,input:GroupInput):Promise<unknown>;
 abstract updateGroup(actorId:string,id:string,input:Partial<GroupInput>&{activo?:boolean}):Promise<unknown>;
 abstract modifiers(f:Paging&{grupoId?:string}):Promise<Page>;
 abstract createModifier(actorId:string,input:ModifierInput):Promise<unknown>;
 abstract updateModifier(actorId:string,id:string,input:Partial<Omit<ModifierInput,'grupoId'>>&{activo?:boolean}):Promise<unknown>;
 abstract attachGroups(actorId:string,variantId:string,groups:Array<{grupoId:string;orden:number;obligatorio:boolean}>):Promise<unknown>;
 abstract createVariantPrice(actorId:string,input:PriceInput):Promise<unknown>;
 abstract createModifierPrice(actorId:string,input:PriceInput):Promise<unknown>;
 abstract variantPriceHistory(variantId:string,sucursalId:string):Promise<unknown>;
 abstract modifierPriceHistory(modifierId:string,sucursalId:string):Promise<unknown>;
 abstract resolvePrice(variantId:string,sucursalId:string,at:Date):Promise<unknown>;
 abstract quote(variantId:string,sucursalId:string,modifierIds:string[],at:Date):Promise<unknown>;
 abstract menus(f:Paging,sucursalId?:string):Promise<Page>;
 abstract menu(id:string):Promise<unknown|null>;
 abstract createMenu(actorId:string,input:MenuInput):Promise<unknown>;
 abstract updateMenu(actorId:string,id:string,input:{nombre?:string;descripcion?:string|null;activo?:boolean}):Promise<unknown>;
 abstract replaceLayout(actorId:string,id:string,input:MenuLayout):Promise<unknown>;
 abstract publishMenu(actorId:string,id:string,expectedVersion:number):Promise<unknown>;
 abstract unpublishMenu(actorId:string,id:string):Promise<unknown>;
 abstract branchMenu(sucursalId:string,at:Date):Promise<unknown>;
 abstract productReadiness(id:string,sucursalId:string,at:Date):Promise<unknown>;
 abstract replaceMedia(actorId:string,entity:'product'|'variant'|'category',id:string,mediaIds:string[]):Promise<unknown>;
 abstract summary(scope:CatalogScope,sucursalId?:string):Promise<unknown>;
 abstract coverage(scope:CatalogScope,sucursalId:string,at:Date):Promise<unknown>;
}
