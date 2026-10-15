import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Paging,Options,GroupInput,ModifierInput,PriceInput} from '../../application/ports/catalog.repository.port.js';
import {bounds,catalogName,decimalPrice,period} from '../../domain/catalog.policy.js';
import {activeBranch,audit,failUnique,groupInclude,modifierPrice,money,permission,serial,variantPrice} from './catalog-prisma.shared.js';
@Injectable()
export class CatalogPricingStore{
 constructor(private readonly db:PrismaService){}
 async modifierGroups(f:Paging){
  const where:Prisma.GrupoModificadorWhereInput={...(f.activo===undefined?{}:{activo:f.activo}),
   ...(f.search?{nombre:{contains:f.search,mode:'insensitive'}}:{})};
  const [data,total]=await this.db.$transaction([
   this.db.grupoModificador.findMany({where,include:groupInclude,orderBy:{nombre:'asc'},
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.grupoModificador.count({where})]);
  return {data,total};
 }
 async groupOptions(f:Options){
  const where:Prisma.GrupoModificadorWhereInput={activo:true,
   ...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{nombre:{contains:f.search,mode:'insensitive'}}:{})};
  const rows=await this.db.grupoModificador.findMany({where,include:groupInclude,orderBy:{id:'asc'},take:f.limit+1});
  return {data:rows.slice(0,f.limit).map(x=>({...x,label:x.nombre})),
   nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async createGroup(actor:string,input:GroupInput){
  bounds(input.minimo,input.maximo);
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const row=await tx.grupoModificador.create({data:{
    nombre:catalogName(input.nombre),minimo:input.minimo,maximo:input.maximo??null
   },include:groupInclude});
   await audit(tx,actor,'MODIFIER_GROUP_CREATED','GrupoModificador',row.id,null,null,{
    nombre:row.nombre,minimo:row.minimo,maximo:row.maximo});
   return row;
  },serial);
 }
 async updateGroup(actor:string,id:string,input:Partial<GroupInput>&{activo?:boolean}){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const before=await tx.grupoModificador.findUnique({where:{id}});
   if(!before)throw new NotFoundException('Grupo inexistente');
   bounds(input.minimo??before.minimo,input.maximo===undefined?before.maximo:input.maximo);
   const row=await tx.grupoModificador.update({where:{id},data:{
    ...input,nombre:input.nombre===undefined?undefined:catalogName(input.nombre)
   },include:groupInclude});
   await audit(tx,actor,'MODIFIER_GROUP_UPDATED','GrupoModificador',id,null,
    {nombre:before.nombre,minimo:before.minimo,maximo:before.maximo,activo:before.activo},
    {nombre:row.nombre,minimo:row.minimo,maximo:row.maximo,activo:row.activo});
   return row;
  },serial);
 }
 async modifiers(f:Paging&{grupoId?:string}){
  const where:Prisma.ModificadorWhereInput={
   ...(f.grupoId?{grupoId:f.grupoId}:{}),
   ...(f.activo===undefined?{}:{activo:f.activo}),
   ...(f.search?{nombre:{contains:f.search,mode:'insensitive'}}:{})};
  const [data,total]=await this.db.$transaction([
   this.db.modificador.findMany({where,include:{grupo:true},orderBy:{nombre:'asc'},
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.modificador.count({where})]);
  return {data,total};
 }
 async createModifier(actor:string,input:ModifierInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const group=await tx.grupoModificador.findUnique({where:{id:input.grupoId}});
   if(!group||!group.activo)throw new ConflictException('Grupo inexistente o inactivo');
   const row=await tx.modificador.create({data:{
    grupoId:input.grupoId,nombre:catalogName(input.nombre),
    incrementoPrecio:decimalPrice(input.incrementoPrecio)
   },include:{grupo:true}});
   await audit(tx,actor,'MODIFIER_CREATED','Modificador',row.id,null,null,
    {grupoId:row.grupoId,nombre:row.nombre,incrementoPrecio:row.incrementoPrecio.toFixed(2)});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async updateModifier(actor:string,id:string,input:Partial<Omit<ModifierInput,'grupoId'>>&{activo?:boolean}){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const old=await tx.modificador.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Modificador inexistente');
   const row=await tx.modificador.update({where:{id},data:{
    ...input,nombre:input.nombre===undefined?undefined:catalogName(input.nombre),
    incrementoPrecio:input.incrementoPrecio===undefined?undefined:decimalPrice(input.incrementoPrecio)
   },include:{grupo:true}});
   await audit(tx,actor,'MODIFIER_UPDATED','Modificador',id,null,
    {nombre:old.nombre,activo:old.activo,incrementoPrecio:old.incrementoPrecio.toFixed(2)},
    {nombre:row.nombre,activo:row.activo,incrementoPrecio:row.incrementoPrecio.toFixed(2)});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async attachGroups(actor:string,variantId:string,groups:Array<{grupoId:string;orden:number;obligatorio:boolean}>){
  if(new Set(groups.map(x=>x.grupoId)).size!==groups.length)throw new ConflictException('Grupo repetido');
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const variant=await tx.varianteProducto.findUnique({where:{id:variantId}});
   if(!variant)throw new NotFoundException('Variante inexistente');
   const existing=await tx.grupoModificador.findMany({where:{id:{in:groups.map(x=>x.grupoId)},activo:true}});
   if(existing.length!==groups.length)throw new ConflictException('Grupo inactivo o desconocido');
   for(const g of groups){
    const group=existing.find(x=>x.id===g.grupoId)!;
    if((g.obligatorio||group.minimo>0)&&await tx.modificador.count({where:{grupoId:g.grupoId,activo:true}})<
      Math.max(1,group.minimo))throw new ConflictException('Grupo obligatorio sin suficientes opciones activas');
   }
   const before=await tx.varianteGrupoModificador.findMany({where:{varianteId:variantId}});
   await tx.varianteGrupoModificador.deleteMany({where:{varianteId:variantId}});
   if(groups.length)await tx.varianteGrupoModificador.createMany({data:groups.map(x=>({
    varianteId:variantId,grupoId:x.grupoId,orden:x.orden,obligatorio:x.obligatorio
   }))});
   await audit(tx,actor,'VARIANT_MODIFIERS_UPDATED','VarianteProducto',variantId,null,
    {grupos:before.map(x=>x.grupoId)},{grupos:groups.map(x=>x.grupoId)});
   return tx.varianteGrupoModificador.findMany({where:{varianteId:variantId},
    include:{grupo:{include:{modificadoresComoGrupo:true}}},orderBy:{orden:'asc'}});
  },serial);
 }
 async createVariantPrice(actor:string,input:PriceInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.prices.manage',input.sucursalId);
   await activeBranch(tx,input.sucursalId);
   const variant=await tx.varianteProducto.findUnique({where:{id:input.entityId},include:{producto:true}});
   if(!variant||!variant.activo||!variant.producto.activo)throw new ConflictException('Variante o producto inactivo');
   const from=new Date(input.vigenteDesde),to=input.vigenteHasta?new Date(input.vigenteHasta):null;
   period(from,to);
   const current=await tx.precioVariante.findFirst({where:{
    varianteId:input.entityId,sucursalId:input.sucursalId,vigenteHasta:null,
    vigenteDesde:{lt:from}},orderBy:{vigenteDesde:'desc'}});
   if(current){
    await tx.precioVariante.update({where:{id:current.id},data:{vigenteHasta:from}});
   }
   const row=await tx.precioVariante.create({data:{
    varianteId:input.entityId,sucursalId:input.sucursalId,importe:decimalPrice(input.importe),
    vigenteDesde:from,vigenteHasta:to
   }});
   await audit(tx,actor,'VARIANT_PRICE_CREATED','PrecioVariante',row.id,input.sucursalId,null,
    {varianteId:row.varianteId,importe:row.importe.toFixed(2),vigenteDesde:row.vigenteDesde.toISOString(),
     vigenteHasta:row.vigenteHasta?.toISOString()??null});
   return {...row,importe:row.importe.toFixed(2)};
  },serial);}catch(e){failUnique(e);}
 }
 async createModifierPrice(actor:string,input:PriceInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.prices.manage',input.sucursalId);
   await activeBranch(tx,input.sucursalId);
   const mod=await tx.modificador.findUnique({where:{id:input.entityId},include:{grupo:true}});
   if(!mod||!mod.activo||!mod.grupo.activo)throw new ConflictException('Modificador inactivo');
   const from=new Date(input.vigenteDesde),to=input.vigenteHasta?new Date(input.vigenteHasta):null;
   period(from,to);
   const current=await tx.precioModificador.findFirst({where:{
    modificadorId:input.entityId,sucursalId:input.sucursalId,vigenteHasta:null,
    vigenteDesde:{lt:from}},orderBy:{vigenteDesde:'desc'}});
   if(current)await tx.precioModificador.update({where:{id:current.id},data:{vigenteHasta:from}});
   const row=await tx.precioModificador.create({data:{
    modificadorId:input.entityId,sucursalId:input.sucursalId,importe:decimalPrice(input.importe),
    vigenteDesde:from,vigenteHasta:to
   }});
   await audit(tx,actor,'MODIFIER_PRICE_CREATED','PrecioModificador',row.id,input.sucursalId,null,
    {modificadorId:row.modificadorId,importe:row.importe.toFixed(2),vigenteDesde:row.vigenteDesde.toISOString()});
   return {...row,importe:row.importe.toFixed(2)};
  },serial);}catch(e){failUnique(e);}
 }
 async variantPriceHistory(variantId:string,sucursalId:string){
  return this.db.precioVariante.findMany({where:{varianteId:variantId,sucursalId},orderBy:{vigenteDesde:'desc'}});
 }
 async modifierPriceHistory(modifierId:string,sucursalId:string){
  return this.db.precioModificador.findMany({where:{modificadorId:modifierId,sucursalId},orderBy:{vigenteDesde:'desc'}});
 }
 async resolvePrice(variantId:string,sucursalId:string,at:Date){
  const [v,b,price,over]=await Promise.all([
   this.db.varianteProducto.findUnique({where:{id:variantId},include:{producto:true}}),
   this.db.sucursal.findUnique({where:{id:sucursalId},include:{configuracionSucursalesComoSucursal:true}}),
   variantPrice(this.db,variantId,sucursalId,at),
   this.db.varianteSucursal.findUnique({where:{varianteId_sucursalId:{varianteId:variantId,sucursalId}}})
  ]);
  if(!v)throw new NotFoundException('Variante inexistente');
  if(!b)throw new NotFoundException('Sucursal inexistente');
  const active=v.activo&&v.producto.activo&&b.activa&&(over?.habilitada??true)&&(!over?.pausadaHasta||over.pausadaHasta<=at);
  return {varianteId:variantId,sucursalId,moneda:b.configuracionSucursalesComoSucursal?.moneda??'GTQ',
   importe:price?.importe.toFixed(2)??null,vigenteDesde:price?.vigenteDesde??null,
   vigenteHasta:price?.vigenteHasta??null,habilitada:active,motivo:!active?'NO_HABILITADA':!price?'SIN_PRECIO':null};
 }
 async quote(variantId:string,sucursalId:string,modifierIds:string[],at:Date){
  if(new Set(modifierIds).size!==modifierIds.length)throw new BadRequestException('Modificadores repetidos');
  if(modifierIds.length>30)throw new BadRequestException('Demasiados modificadores');
  const base=await this.resolvePrice(variantId,sucursalId,at);
  if(!base.habilitada||base.importe===null)throw new ConflictException('Variante no vendible o sin precio vigente');
  const [links,mods]=await Promise.all([
   this.db.varianteGrupoModificador.findMany({where:{varianteId:variantId},include:{grupo:true}}),
   this.db.modificador.findMany({where:{id:{in:modifierIds}},include:{grupo:true}})
  ]);
  if(mods.length!==modifierIds.length||mods.some(x=>!x.activo||!x.grupo.activo))
   throw new ConflictException('Modificador inexistente o inactivo');
  const linked=new Map(links.map(x=>[x.grupoId,x]));
  const counts=new Map<string,number>();
  for(const mod of mods){
   if(!linked.has(mod.grupoId))throw new ConflictException('Modificador no permitido para la variante');
   counts.set(mod.grupoId,(counts.get(mod.grupoId)??0)+1);
  }
  for(const link of links){
   const count=counts.get(link.grupoId)??0;
   if(count<Math.max(link.obligatorio?1:0,link.grupo.minimo)||link.grupo.maximo!==null&&count>link.grupo.maximo)
    throw new ConflictException(`Selección inválida en grupo ${link.grupo.nombre}`);
  }
  const priced=await Promise.all(mods.map(async mod=>({
   modificadorId:mod.id,nombre:mod.nombre,grupoId:mod.grupoId,
   incremento:money(await modifierPrice(this.db,mod.id,sucursalId,at))
  })));
  const total=priced.reduce((sum,x)=>sum.plus(x.incremento),new Prisma.Decimal(base.importe));
  return {varianteId:variantId,sucursalId,fecha:at.toISOString(),moneda:base.moneda,
   precioBase:base.importe,modificadores:priced,total:total.toFixed(2),
   advertencia:'Cotización comercial; no verifica stock ni consume ingredientes'};
 }
}
