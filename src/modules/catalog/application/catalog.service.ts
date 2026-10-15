import {ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import {CatalogRepositoryPort,type Paging,type Options,type CatalogScope,type CategoryInput,type ProductInput,
 type VariantInput,type GroupInput,type ModifierInput,type PriceInput,type MenuInput,type MenuLayout,type CatalogKind} from './ports/catalog.repository.port.js';
import {CatalogMediaService} from './catalog-media.service.js';
import {catalogCode,catalogName,decimalPrice,period,requirePatch} from '../domain/catalog.policy.js';
const paged=(p:Paging,total:number)=>({page:p.page,limit:p.limit,total,totalPages:Math.ceil(total/p.limit)});
const options=(cursor:string|null)=>({hasMore:!!cursor,nextCursor:cursor});
@Injectable()
export class CatalogService{
 constructor(private readonly repo:CatalogRepositoryPort,private readonly identity:IdentityRepository,
  private readonly media:CatalogMediaService){}
 private async global(a:Principal,permission:string){
  if(!(await this.identity.capabilities(a.id,null)).includes(permission))
   throw new ForbiddenException('Permiso global requerido');
 }
 private async branch(a:Principal,id:string,permission:string){
  if(!(await this.identity.capabilities(a.id,id)).includes(permission))
   throw new ForbiddenException('Permiso de sucursal requerido');
 }
 private async scope(a:Principal,permission:string):Promise<CatalogScope>{
  const s=await this.repo.scope(a.id,permission);
  if(!s.global&&!s.branchIds.length)throw new ForbiddenException('Permiso de catálogo insuficiente');
  return s;
 }
 private async branchQuery(a:Principal,b:string){
  await this.branch(a,b,'catalog.read');
 }
 private async present<T>(data:T):Promise<T>{return this.media.enrich(data);}
 async categories(a:Principal,f:Paging){
  await this.scope(a,'catalog.read');const r=await this.repo.categories(f);
  return {data:await this.present(r.data),meta:paged(f,r.total)};
 }
 async categoryOptions(a:Principal,f:Options){
  await this.scope(a,'catalog.read');const r=await this.repo.categoryOptions(f);
  return {data:await this.present(r.data),meta:options(r.nextCursor)};
 }
 async categoryTree(a:Principal){await this.scope(a,'catalog.read');return this.present(await this.repo.categoryTree());}
 async category(a:Principal,id:string){await this.scope(a,'catalog.read');
  const r=await this.repo.category(id);if(!r)throw new NotFoundException('Categoría inexistente');return this.present(r);}
 async createCategory(a:Principal,v:CategoryInput){
  await this.global(a,'catalog.manage');return this.present(await this.repo.createCategory(a.id,{...v,nombre:catalogName(v.nombre)}));
 }
 async updateCategory(a:Principal,id:string,v:Partial<CategoryInput>){
  requirePatch(v);await this.global(a,'catalog.manage');
  return this.present(await this.repo.updateCategory(a.id,id,v));
 }
 async statusCategory(a:Principal,id:string,active:boolean,motive:string){
  await this.global(a,'catalog.manage');return this.present(await this.repo.statusCategory(a.id,id,active,motive));
 }
 async products(a:Principal,f:Paging&{categoriaId?:string;tipo?:CatalogKind}){
  await this.scope(a,'catalog.read');const r=await this.repo.products(f);
  return {data:await this.present(r.data),meta:paged(f,r.total)};
 }
 async productOptions(a:Principal,f:Options&{sucursalId?:string}){
  await this.scope(a,'catalog.read');if(f.sucursalId)await this.branchQuery(a,f.sucursalId);
  const r=await this.repo.productOptions(f);
  return {data:await this.present(r.data),meta:options(r.nextCursor)};
 }
 async product(a:Principal,id:string,b?:string){
  await this.scope(a,'catalog.read');if(b)await this.branchQuery(a,b);
  const r=await this.repo.product(id,b);if(!r)throw new NotFoundException('Producto inexistente');
  return this.present(r);
 }
 async createProduct(a:Principal,v:ProductInput){
  await this.global(a,'catalog.manage');
  return this.present(await this.repo.createProduct(a.id,{...v,codigo:catalogCode(v.codigo),
   nombre:catalogName(v.nombre)}));
 }
 async updateProduct(a:Principal,id:string,v:{nombre?:string;descripcion?:string|null;categoriaId?:string|null;visibleEnMenu?:boolean}){
  requirePatch(v);await this.global(a,'catalog.manage');
  return this.present(await this.repo.updateProduct(a.id,id,v));
 }
 async statusProduct(a:Principal,id:string,active:boolean,motive:string){
  await this.global(a,'catalog.manage');return this.present(await this.repo.statusProduct(a.id,id,active,motive));
 }
 async createVariant(a:Principal,id:string,v:VariantInput){
  await this.global(a,'catalog.manage');return this.present(await this.repo.createVariant(a.id,id,v));
 }
 async updateVariant(a:Principal,id:string,v:Partial<VariantInput>&{activo?:boolean}){
  requirePatch(v);await this.global(a,'catalog.manage');return this.present(await this.repo.updateVariant(a.id,id,v));
 }
 async variant(a:Principal,id:string,b?:string){
  await this.scope(a,'catalog.read');if(b)await this.branchQuery(a,b);
  const r=await this.repo.variant(id,b);if(!r)throw new NotFoundException('Variante inexistente');
  return this.present(r);
 }
 async variantOptions(a:Principal,f:Options&{productoId?:string;sucursalId?:string}){
  await this.scope(a,'catalog.read');if(f.sucursalId)await this.branchQuery(a,f.sucursalId);
  const r=await this.repo.variantOptions(f);
  return {data:await this.present(r.data),meta:options(r.nextCursor)};
 }
 async variantBranch(a:Principal,id:string,b:string,v:{habilitada:boolean;pausadaHasta?:string|null;motivo?:string|null}){
  await this.branch(a,b,'catalog.manage');
  if(v.pausadaHasta&&Number.isNaN(new Date(v.pausadaHasta).getTime()))
   throw new ForbiddenException('Fecha de pausa inválida');
  return this.repo.variantBranch(a.id,id,b,v);
 }
 async groups(a:Principal,f:Paging){
  await this.scope(a,'catalog.read');const r=await this.repo.modifierGroups(f);
  return {data:await this.present(r.data),meta:paged(f,r.total)};
 }
 async groupOptions(a:Principal,f:Options){
  await this.scope(a,'catalog.read');const r=await this.repo.groupOptions(f);
  return {data:r.data,meta:options(r.nextCursor)};
 }
 async createGroup(a:Principal,v:GroupInput){
  await this.global(a,'catalog.manage');return this.present(await this.repo.createGroup(a.id,v));
 }
 async updateGroup(a:Principal,id:string,v:Partial<GroupInput>&{activo?:boolean}){
  requirePatch(v);await this.global(a,'catalog.manage');return this.present(await this.repo.updateGroup(a.id,id,v));
 }
 async modifiers(a:Principal,f:Paging&{grupoId?:string}){
  await this.scope(a,'catalog.read');const r=await this.repo.modifiers(f);
  return {data:r.data,meta:paged(f,r.total)};
 }
 async createModifier(a:Principal,v:ModifierInput){
  await this.global(a,'catalog.manage');
  return this.present(await this.repo.createModifier(a.id,{...v,incrementoPrecio:decimalPrice(v.incrementoPrecio)}));
 }
 async updateModifier(a:Principal,id:string,v:Partial<Omit<ModifierInput,'grupoId'>>&{activo?:boolean}){
  requirePatch(v);await this.global(a,'catalog.manage');
  return this.present(await this.repo.updateModifier(a.id,id,v));
 }
 async attachGroups(a:Principal,id:string,v:Array<{grupoId:string;orden:number;obligatorio:boolean}>){
  await this.global(a,'catalog.manage');return this.present(await this.repo.attachGroups(a.id,id,v));
 }
 async createPrice(a:Principal,kind:'variant'|'modifier',v:PriceInput){
  await this.branch(a,v.sucursalId,'catalog.prices.manage');
  period(new Date(v.vigenteDesde),v.vigenteHasta?new Date(v.vigenteHasta):null);
  const data={...v,importe:decimalPrice(v.importe)};
  return kind==='variant'?this.repo.createVariantPrice(a.id,data):this.repo.createModifierPrice(a.id,data);
 }
 async priceHistory(a:Principal,kind:'variant'|'modifier',id:string,b:string){
  await this.branch(a,b,'catalog.read');
  return this.present(kind==='variant'?await this.repo.variantPriceHistory(id,b):await this.repo.modifierPriceHistory(id,b));
 }
 async price(a:Principal,id:string,b:string,when?:string){
  await this.branchQuery(a,b);return this.repo.resolvePrice(id,b,this.date(when));
 }
 async quote(a:Principal,id:string,b:string,modifiers:string[],when?:string){
  await this.branchQuery(a,b);
  return this.repo.quote(id,b,modifiers,this.date(when));
 }
 private date(when?:string):Date{
  const d=when?new Date(when):new Date();
  if(Number.isNaN(d.getTime()))throw new ForbiddenException('Fecha inválida');return d;
 }
 async menus(a:Principal,f:Paging,b?:string){
  const s=await this.scope(a,'catalog.read');
  if(b&&!s.global&&!s.branchIds.includes(b))throw new ForbiddenException();
  const r=await this.repo.menus(f,b,s.global?undefined:s.branchIds);
  return {data:await this.present(r.data),meta:{...paged(f,r.total),alcance:s.global?'GLOBAL':'SUCURSAL'}};
 }
 async menu(a:Principal,id:string){
  const s=await this.scope(a,'catalog.read');
  const r=await this.repo.menu(id);
  if(!r)throw new NotFoundException('Menú inexistente');
  if(!s.global&&!(r as {sucursales:Array<{sucursalId:string}>}).sucursales.some(x=>s.branchIds.includes(x.sucursalId)))
   throw new ForbiddenException();
  return this.present(r);
 }
 async createMenu(a:Principal,v:MenuInput){
  await this.global(a,'catalog.menus.manage');
  return this.present(await this.repo.createMenu(a.id,{...v,codigo:catalogCode(v.codigo),nombre:catalogName(v.nombre)}));
 }
 async updateMenu(a:Principal,id:string,v:{nombre?:string;descripcion?:string|null;activo?:boolean}){
  requirePatch(v);await this.global(a,'catalog.menus.manage');
  return this.present(await this.repo.updateMenu(a.id,id,v));
 }
 async layout(a:Principal,id:string,v:MenuLayout){
  await this.global(a,'catalog.menus.manage');return this.present(await this.repo.replaceLayout(a.id,id,v));
 }
 async publish(a:Principal,id:string,version:number){
  await this.global(a,'catalog.menus.manage');return this.present(await this.repo.publishMenu(a.id,id,version));
 }
 async unpublish(a:Principal,id:string){
  await this.global(a,'catalog.menus.manage');return this.present(await this.repo.unpublishMenu(a.id,id));
 }
 async branchMenu(a:Principal,b:string,when?:string){
  await this.branchQuery(a,b);return this.present(await this.repo.branchMenu(b,this.date(when)));
 }
 async readiness(a:Principal,id:string,b:string,when?:string){
  await this.branchQuery(a,b);return this.repo.productReadiness(id,b,this.date(when));
 }
 async replaceMedia(a:Principal,kind:'product'|'variant'|'category',id:string,ids:string[]){
  await this.global(a,'catalog.manage');return this.repo.replaceMedia(a.id,kind,id,ids);
 }
 async summary(a:Principal,b?:string){
  const scope=await this.scope(a,'catalog.reports.read');
  if(b&&!scope.global&&!scope.branchIds.includes(b))throw new ForbiddenException();
  return this.repo.summary(scope,b);
 }
 async coverage(a:Principal,b:string,when?:string){
  const s=await this.scope(a,'catalog.reports.read');
  if(!s.global&&!s.branchIds.includes(b))throw new ForbiddenException();
  return this.repo.coverage(s,b,this.date(when));
 }
}
