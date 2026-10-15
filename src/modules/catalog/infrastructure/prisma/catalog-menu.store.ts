import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Paging,MenuInput,MenuLayout} from '../../application/ports/catalog.repository.port.js';
import {catalogCode,catalogName,hourAt,validSchedule} from '../../domain/catalog.policy.js';
import {activeBranch,audit,failUnique,menuInclude,permission,serial,variantPrice} from './catalog-prisma.shared.js';

type MenuData=Prisma.MenuGetPayload<{include:typeof menuInclude}>;
@Injectable()
export class CatalogMenuStore{
 constructor(private readonly db:PrismaService){}
 async menus(f:Paging,sucursalId?:string){
  const where:Prisma.MenuWhereInput={
   ...(f.activo===undefined?{}:{activo:f.activo}),
   ...(sucursalId?{sucursales:{some:{sucursalId,activa:true}}}:{}),
   ...(f.search?{OR:[{codigo:{contains:f.search,mode:'insensitive'}},
    {nombre:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const [data,total]=await this.db.$transaction([
   this.db.menu.findMany({where,include:menuInclude,orderBy:{creadoEn:'desc'},
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.menu.count({where})]);
  return {data,total};
 }
 async menu(id:string){return this.db.menu.findUnique({where:{id},include:menuInclude});}
 async createMenu(actor:string,input:MenuInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   for(const branchId of input.sucursalIds)await activeBranch(tx,branchId);
   if(new Set(input.sucursalIds).size!==input.sucursalIds.length)
    throw new ConflictException('Sucursales duplicadas');
   const row=await tx.menu.create({data:{
    codigo:catalogCode(input.codigo),nombre:catalogName(input.nombre),
    descripcion:input.descripcion??null,
    sucursales:{create:input.sucursalIds.map(sucursalId=>({sucursalId}))}
   },include:menuInclude});
   await audit(tx,actor,'MENU_CREATED','Menu',row.id,null,null,
    {codigo:row.codigo,nombre:row.nombre,sucursales:input.sucursalIds});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async updateMenu(actor:string,id:string,input:{nombre?:string;descripcion?:string|null;activo?:boolean}){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   const existing=await tx.menu.findUnique({where:{id}});
   if(!existing)throw new NotFoundException('Menú inexistente');
   const row=await tx.menu.update({where:{id},data:{
    ...input,nombre:input.nombre===undefined?undefined:catalogName(input.nombre),
    version:{increment:1},
    publicadoEn:input.activo===false?null:existing.publicadoEn
   },include:menuInclude});
   await audit(tx,actor,'MENU_UPDATED','Menu',id,null,
    {nombre:existing.nombre,activo:existing.activo,version:existing.version},
    {nombre:row.nombre,activo:row.activo,version:row.version});
   return row;
  },serial);
 }
 async replaceLayout(actor:string,id:string,input:MenuLayout){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   const old=await tx.menu.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Menú inexistente');
   const branches=[...new Set(input.sucursalIds)];
   if(branches.length!==input.sucursalIds.length)throw new ConflictException('Sucursal repetida');
   for(const branch of branches)await activeBranch(tx,branch);
   const names=new Set<string>();
   for(const section of input.secciones){
    if(section.orden<0)throw new ConflictException('Orden inválido');
    const name=catalogName(section.nombre).toLowerCase();
    if(names.has(name))throw new ConflictException('Sección duplicada');
    names.add(name);
    if(new Set(section.items.map(x=>x.varianteId)).size!==section.items.length)
     throw new ConflictException('Variante repetida en sección');
   }
   for(const h of input.horarios)validSchedule(h.diaSemana,h.desde,h.hasta);
   const allVariantIds=[...new Set(input.secciones.flatMap(x=>x.items.map(i=>i.varianteId)))];
   const variants=await tx.varianteProducto.findMany({where:{id:{in:allVariantIds}},include:{producto:true}});
   if(variants.length!==allVariantIds.length)
    throw new ConflictException('La configuración contiene variantes desconocidas');
   const changed=await tx.menu.updateMany({where:{id,version:input.expectedVersion},
    data:{version:{increment:1},publicadoEn:null}});
   if(changed.count!==1)throw new ConflictException('Menú modificado por otra sesión; refresque y vuelva a intentar');
   await tx.menuSeccion.deleteMany({where:{menuId:id}});
   await tx.menuHorario.deleteMany({where:{menuId:id}});
   await tx.menuSucursal.deleteMany({where:{menuId:id}});
   if(branches.length)await tx.menuSucursal.createMany({data:branches.map(sucursalId=>({menuId:id,sucursalId}))});
   if(input.horarios.length)await tx.menuHorario.createMany({data:input.horarios.map(h=>({menuId:id,...h}))});
   for(const section of input.secciones){
    await tx.menuSeccion.create({data:{menuId:id,nombre:catalogName(section.nombre),
     orden:section.orden,items:{create:section.items.map(item=>({
      varianteId:item.varianteId,orden:item.orden}))}}});
   }
   await audit(tx,actor,'MENU_LAYOUT_REPLACED','Menu',id,null,
    {version:old.version},{version:old.version+1,sucursales:branches,
     secciones:input.secciones.length,variantes:allVariantIds.length,horarios:input.horarios.length});
   return tx.menu.findUniqueOrThrow({where:{id},include:menuInclude});
  },serial);}catch(e){failUnique(e);}
 }
 async readiness(variantId:string,sucursalId:string,at:Date){
  const [v,b,price,over]=await Promise.all([
   this.db.varianteProducto.findUnique({where:{id:variantId},include:{
    producto:{include:{medios:{include:{media:true}}}},
    medios:{include:{media:true}},articuloInventario:true
   }}),
   this.db.sucursal.findUnique({where:{id:sucursalId}}),
   variantPrice(this.db,variantId,sucursalId,at),
   this.db.varianteSucursal.findUnique({where:{varianteId_sucursalId:{varianteId:variantId,sucursalId}}})
  ]);
  const warnings:string[]=[];
  if(!v){warnings.push('VARIANTE_NO_EXISTE');return {varianteId,sucursalId,lista:false,advertencias:warnings};}
  if(!b?.activa)warnings.push('SUCURSAL_INACTIVA');
  if(!v.activo||!v.producto.activo)warnings.push('PRODUCTO_O_VARIANTE_INACTIVA');
  if(!v.producto.visibleEnMenu)warnings.push('OCULTA_EN_MENU');
  if(!price)warnings.push('SIN_PRECIO');
  if(over&&!over.habilitada||over?.pausadaHasta&&over.pausadaHasta>at)warnings.push('PAUSADA_EN_SUCURSAL');
  const photos=[...v.medios,...v.producto.medios];
  if(!photos.some(x=>x.media.tipo==='IMAGEN'&&!!x.media.confirmadaEn&&!x.media.eliminadaEn))
   warnings.push('SIN_FOTOGRAFIA_CONFIRMADA');
  if(v.producto.tipo==='INVENTARIABLE'&&(!v.articuloInventario||!v.articuloInventario.activo))
   warnings.push('ARTICULO_FISICO_INVALIDO');
  return {varianteId,sucursalId,lista:warnings.length===0,advertencias:warnings,
   precio:price?.importe.toFixed(2)??null,
   receta:'NO_VERIFICADA_HASTA_REC_A',stock:'NO_VERIFICADO_HASTA_INV_B'};
 }
 async productReadiness(id:string,sucursalId:string,at:Date){
  const product=await this.db.producto.findUnique({where:{id},include:{varianteProductosComoProducto:true}});
  if(!product)throw new NotFoundException('Producto inexistente');
  const variantes=await Promise.all(product.varianteProductosComoProducto.map(v=>
   this.readiness(v.id,sucursalId,at)));
  return {productoId:id,sucursalId,lista:variantes.some(v=>v.lista),variantes};
 }
 async publishMenu(actor:string,id:string,expectedVersion:number){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   const menu=await tx.menu.findUnique({where:{id},include:menuInclude});
   if(!menu)throw new NotFoundException('Menú inexistente');
   if(!menu.activo)throw new ConflictException('No se puede publicar un menú inactivo');
   if(!menu.sucursales.length||!menu.secciones.length)
    throw new ConflictException('Menú sin sucursales o secciones');
   if(!menu.secciones.some(x=>x.activa&&x.items.some(y=>y.activo)))
    throw new ConflictException('Menú sin variantes activas');
   const ids=[...new Set(menu.secciones.filter(x=>x.activa).flatMap(x=>x.items.filter(y=>y.activo).map(y=>y.varianteId)))];
   for(const branch of menu.sucursales.filter(x=>x.activa)){
    await activeBranch(tx,branch.sucursalId);
    for(const variantId of ids){
     const status=await this.readiness(variantId,branch.sucursalId,new Date());
     if(!status.lista)throw new ConflictException(
      `Menú incompleto: variante ${variantId}, sucursal ${branch.sucursal.codigo}: ${status.advertencias.join(', ')}`);
    }
   }
   const changed=await tx.menu.updateMany({where:{id,version:expectedVersion},
    data:{version:{increment:1},publicadoEn:new Date()}});
   if(changed.count!==1)throw new ConflictException('La versión del menú cambió; actualice antes de publicar');
   await audit(tx,actor,'MENU_PUBLISHED','Menu',id,null,
    {version:expectedVersion},{version:expectedVersion+1,publicado:true});
   return tx.menu.findUniqueOrThrow({where:{id},include:menuInclude});
  },serial);
 }
 async unpublishMenu(actor:string,id:string){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   const old=await tx.menu.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Menú inexistente');
   const row=await tx.menu.update({where:{id},data:{publicadoEn:null,version:{increment:1}},include:menuInclude});
   await audit(tx,actor,'MENU_UNPUBLISHED','Menu',id,null,
    {publicadoEn:old.publicadoEn},{publicadoEn:null});
   return row;
  },serial);
 }
 async branchMenu(sucursalId:string,at:Date){
  const branch=await this.db.sucursal.findUnique({where:{id:sucursalId}});
  if(!branch||!branch.activa)throw new NotFoundException('Sucursal no disponible');
  const time=hourAt(at,branch.zonaHoraria);
  const menus=await this.db.menu.findMany({where:{activo:true,publicadoEn:{not:null},
   sucursales:{some:{sucursalId,activa:true}}},
   include:menuInclude,orderBy:{nombre:'asc'}});
  const output:unknown[]=[];
  for(const menu of menus){
   const schedule=menu.horarios.filter(x=>x.activo);
   if(schedule.length&&!schedule.some(x=>x.diaSemana===time.day&&x.desde<=time.time&&x.hasta>time.time))continue;
   const sections:unknown[]=[];
   for(const section of menu.secciones.filter(x=>x.activa)){
    const items:unknown[]=[];
    for(const item of section.items.filter(x=>x.activo)){
     const status=await this.readiness(item.varianteId,sucursalId,at);
     if(!status.lista)continue;
     items.push({id:item.id,orden:item.orden,variante:item.variante,precio:status.precio,
      moneda:(await this.db.configuracionSucursal.findUnique({where:{sucursalId}}))?.moneda??'GTQ',
      stock:'NO_VERIFICADO_HASTA_INV_B'});
    }
    if(items.length)sections.push({id:section.id,nombre:section.nombre,orden:section.orden,items});
   }
   if(sections.length)output.push({id:menu.id,codigo:menu.codigo,nombre:menu.nombre,
    descripcion:menu.descripcion,secciones:sections});
  }
  return {sucursalId,fecha:at.toISOString(),horaLocal:time.time,menus:output,
   nota:'Disponibilidad comercial; no representa disponibilidad física ni receta'};
 }
}
