import {ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import {InventoryMediaService} from './inventory-media.service.js';
import {InventoryRepositoryPort,type Page,type Options,type ArticleInput,type ArticleUpdate,
 type ArticleFilter,type WarehouseFilter,type LocationFilter,type WarehouseInput,type LocationInput,
 type Scope} from './ports/inventory.repository.port.js';
import {code,requiredName,positiveDecimal,nonNegativeDecimal,expirationRule,requireChange,
 type Dimension,type ArticleKind} from '../domain/inventory.policy.js';
const meta=(p:Page,total:number)=>({page:p.page,limit:p.limit,total,totalPages:Math.ceil(total/p.limit)});
const optMeta=(nextCursor:string|null)=>({hasMore:nextCursor!==null,nextCursor});
@Injectable()
export class InventoryService{
 constructor(private readonly repo:InventoryRepositoryPort,private readonly identity:IdentityRepository,private readonly media:InventoryMediaService){}
 private async global(actor:Principal,permission:string){
  if(!(await this.identity.capabilities(actor.id,null)).includes(permission))
   throw new ForbiddenException('Permiso global requerido');
 }
 private async anyRead(actor:Principal){
  const scope=await this.repo.scope(actor.id,'inventory.read');
  if(!scope.global&&!scope.branchIds.length)throw new ForbiddenException('Sin acceso a inventario');
 }
 private async branch(actor:Principal,branchId:string,permission:string){
  if(!(await this.identity.capabilities(actor.id,branchId)).includes(permission))
   throw new ForbiddenException('Sin autorización para la sucursal');
 }
 private async readScope(actor:Principal,permission:string):Promise<Scope>{
  const scope=await this.repo.scope(actor.id,permission);
  if(!scope.global&&!scope.branchIds.length)throw new ForbiddenException('Permiso de inventario requerido');
  return scope;
 }
 private async costs(actor:Principal):Promise<boolean>{
  return (await this.identity.capabilities(actor.id,null)).includes('inventory.costs.read');
 }
 private async hideCost<T>(value:T,allowed:boolean):Promise<T>{
  if(allowed||value===null||typeof value!=='object')return value;
  const scrub=(v:unknown):unknown=>{
   if(Array.isArray(v))return v.map(scrub);
   if(v instanceof Date||v===null||typeof v!=='object')return v;
   return Object.fromEntries(Object.entries(v).filter(([key])=>
    !['costoReferencia','costoUnitario','costoPromedio','costoTotal','valorInventario'].includes(key))
    .map(([key,data])=>[key,scrub(data)]));
  };
  return scrub(value) as T;
 }
 async units(actor:Principal,f:Page){await this.anyRead(actor);
  const r=await this.repo.listUnits(f);return {data:r.data,meta:meta(f,r.total)};}
 async unitOptions(actor:Principal,f:Options&{dimension?:Dimension}){
  await this.anyRead(actor);const r=await this.repo.unitOptions(f);
  return {data:r.data.map(u=>({...u,label:u.nombre})),meta:optMeta(r.nextCursor)};
 }
 async unit(actor:Principal,id:string){await this.anyRead(actor);
  const result=await this.repo.getUnit(id);if(!result)throw new NotFoundException('Unidad no encontrada');return result;}
 async createUnit(actor:Principal,input:{codigo:string;nombre:string;dimension:Dimension;esBase?:boolean}){
  await this.global(actor,'inventory.units.manage');
  return this.repo.createUnit(actor.id,{...input,codigo:code(input.codigo),nombre:requiredName(input.nombre),esBase:input.esBase??false});
 }
 async updateUnit(actor:Principal,id:string,name:string){
  await this.global(actor,'inventory.units.manage');return this.repo.updateUnit(actor.id,id,requiredName(name));}
 async conversions(actor:Principal,f:Page&{dimension?:Dimension}){
  await this.anyRead(actor);const r=await this.repo.listConversions(f);return {data:r.data,meta:meta(f,r.total)};}
 async createConversion(actor:Principal,input:{unidadOrigenId:string;unidadDestinoId:string;factor:string}){
  await this.global(actor,'inventory.units.manage');
  return this.repo.createConversion(actor.id,{...input,factor:positiveDecimal(input.factor,10)});
 }
 async convert(actor:Principal,originId:string,destId:string,amount:string){
  await this.anyRead(actor);return this.repo.convert(originId,destId,positiveDecimal(amount,6));
 }
 async articles(actor:Principal,f:ArticleFilter){
  await this.anyRead(actor);const r=await this.repo.listArticles(f);
  return {data:await this.media.enrich(await this.hideCost(r.data,await this.costs(actor))),meta:meta(f,r.total)};
 }
 async articleOptions(actor:Principal,f:Options&{tipo?:ArticleKind}){
  await this.anyRead(actor);const r=await this.repo.articleOptions(f);
  return {data:await this.media.enrich(await this.hideCost(r.data,await this.costs(actor))),meta:optMeta(r.nextCursor)};
 }
 async article(actor:Principal,id:string){
  await this.anyRead(actor);const result=await this.repo.getArticle(id);
  if(!result)throw new NotFoundException('Artículo no encontrado');
  return this.media.enrich(await this.hideCost(result,await this.costs(actor)));
 }
 async dependencies(actor:Principal,id:string){
  await this.anyRead(actor);if(!await this.repo.getArticle(id))throw new NotFoundException('Artículo no encontrado');
  return this.repo.dependencies(id);
 }
 async createArticle(actor:Principal,input:ArticleInput){
  await this.global(actor,'inventory.articles.manage');
  expirationRule(input.requiereLote??false,input.requiereVencimiento??false);
  if(input.costoReferencia!==undefined)await this.global(actor,'inventory.costs.manage');
  const r=await this.repo.createArticle(actor.id,{...input,codigo:code(input.codigo),nombre:requiredName(input.nombre),
   costoReferencia:input.costoReferencia==null?input.costoReferencia:nonNegativeDecimal(input.costoReferencia),
   stockMinimo:input.stockMinimo==null?input.stockMinimo:nonNegativeDecimal(input.stockMinimo)});
  return this.media.enrich(await this.hideCost(r,await this.costs(actor)));
 }
 async updateArticle(actor:Principal,id:string,input:ArticleUpdate){
  await this.global(actor,'inventory.articles.manage');requireChange(input);
  if(input.costoReferencia!==undefined)await this.global(actor,'inventory.costs.manage');
  const r=await this.repo.updateArticle(actor.id,id,{...input,
   nombre:input.nombre===undefined?undefined:requiredName(input.nombre),
   costoReferencia:input.costoReferencia==null?input.costoReferencia:nonNegativeDecimal(input.costoReferencia),
   stockMinimo:input.stockMinimo==null?input.stockMinimo:nonNegativeDecimal(input.stockMinimo)});
  return this.media.enrich(await this.hideCost(r,await this.costs(actor)));
 }
 async articleStatus(actor:Principal,id:string,activo:boolean,motivo:string){
  await this.global(actor,'inventory.articles.manage');
  return this.repo.articleStatus(actor.id,id,activo,motivo);
 }
 async articleMedia(actor:Principal,id:string,mediaIds:string[]){
  await this.global(actor,'inventory.articles.manage');
  if(new Set(mediaIds).size!==mediaIds.length)throw new ForbiddenException('Imágenes duplicadas');
  return this.media.enrich(await this.hideCost(await this.repo.articleMedia(actor.id,id,mediaIds),await this.costs(actor)));
 }
 async warehouses(actor:Principal,f:WarehouseFilter){
  const scope=await this.readScope(actor,'inventory.read');const r=await this.repo.listWarehouses(f,scope);
  return {data:r.data,meta:meta(f,r.total)};
 }
 async warehouseOptions(actor:Principal,f:Options&{sucursalId?:string}){
  const scope=await this.readScope(actor,'inventory.read');const r=await this.repo.warehouseOptions(f,scope);
  return {data:r.data,meta:optMeta(r.nextCursor)};
 }
 async warehouse(actor:Principal,id:string){
  const r=await this.repo.getWarehouse(id);if(!r)throw new NotFoundException('Almacén no encontrado');
  await this.branch(actor,r.sucursalId,'inventory.read');return r;
 }
 async createWarehouse(actor:Principal,input:WarehouseInput){
  await this.branch(actor,input.sucursalId,'inventory.warehouses.manage');
  return this.repo.createWarehouse(actor.id,{...input,codigo:code(input.codigo),nombre:requiredName(input.nombre)});
 }
 async updateWarehouse(actor:Principal,id:string,input:{nombre:string}){
  const r=await this.repo.getWarehouse(id);if(!r)throw new NotFoundException('Almacén no encontrado');
  await this.branch(actor,r.sucursalId,'inventory.warehouses.manage');
  return this.repo.updateWarehouse(actor.id,id,{nombre:requiredName(input.nombre)});
 }
 async warehouseStatus(actor:Principal,id:string,activo:boolean,motivo:string){
  const r=await this.repo.getWarehouse(id);if(!r)throw new NotFoundException('Almacén no encontrado');
  await this.branch(actor,r.sucursalId,'inventory.warehouses.manage');
  return this.repo.warehouseStatus(actor.id,id,activo,motivo);
 }
 async locations(actor:Principal,f:LocationFilter){
  const scope=await this.readScope(actor,'inventory.read');const r=await this.repo.listLocations(f,scope);
  return {data:r.data,meta:meta(f,r.total)};
 }
 async locationOptions(actor:Principal,f:Options&{almacenId?:string;sucursalId?:string}){
  const scope=await this.readScope(actor,'inventory.read');const r=await this.repo.locationOptions(f,scope);
  return {data:r.data,meta:optMeta(r.nextCursor)};
 }
 async location(actor:Principal,id:string){
  const r=await this.repo.getLocation(id);if(!r)throw new NotFoundException('Ubicación no encontrada');
  await this.branch(actor,r.sucursalId,'inventory.read');return r;
 }
 async createLocation(actor:Principal,input:LocationInput){
  const w=await this.repo.getWarehouse(input.almacenId);if(!w)throw new NotFoundException('Almacén no encontrado');
  await this.branch(actor,w.sucursalId,'inventory.warehouses.manage');
  return this.repo.createLocation(actor.id,{...input,codigo:code(input.codigo),nombre:requiredName(input.nombre)});
 }
 async updateLocation(actor:Principal,id:string,input:{nombre?:string;esRecepcion?:boolean}){
  requireChange(input);const l=await this.repo.getLocation(id);if(!l)throw new NotFoundException('Ubicación no encontrada');
  await this.branch(actor,l.sucursalId,'inventory.warehouses.manage');
  return this.repo.updateLocation(actor.id,id,{...input,nombre:input.nombre===undefined?undefined:requiredName(input.nombre)});
 }
 async locationStatus(actor:Principal,id:string,activo:boolean,motivo:string){
  const l=await this.repo.getLocation(id);if(!l)throw new NotFoundException('Ubicación no encontrada');
  await this.branch(actor,l.sucursalId,'inventory.warehouses.manage');
  return this.repo.locationStatus(actor.id,id,activo,motivo);
 }
 async overview(actor:Principal,sucursalId?:string){
  const scope=await this.readScope(actor,'inventory.reports.read');
  if(sucursalId&&!scope.global&&!scope.branchIds.includes(sucursalId))throw new ForbiddenException();
  const r=await this.repo.overview(scope,sucursalId);
  return this.hideCost(r,await this.costs(actor));
 }
}
