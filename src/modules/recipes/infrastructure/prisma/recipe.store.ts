import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {quantity,proportion,ensureUnique} from '../../domain/recipe.policy.js';
import {toBase} from './recipe-units.js';
import type {CreateRecipeDto,UpdateRecipeDto,VersionDto,ListRecipesDto,ModifierCompositionDto,
 PackagingRuleDto,PackagingQueryDto} from '../../presentation/http/dto/recipe.dto.js';
type Tx=Prisma.TransactionClient;
export const fullRecipe={
 variante:{include:{producto:true}},articuloResultado:{include:{unidadBase:true}},
 recetaVersionesComoReceta:{orderBy:{numero:'desc' as const},include:{
  unidadRendimiento:true,recetaComponentesComoRecetaVersion:{
   include:{articulo:{include:{unidadBase:true}},unidad:true}}}}
};
export const audit=async(tx:Tx,u:Principal,action:string,entity:string,id:string,after?:Record<string,unknown>)=>
 tx.eventoAuditoria.create({data:{usuarioId:u.id,accion:action,entidad:entity,entidadId:id,
  ...(after?{despues:after as Prisma.InputJsonValue}:{})}});
@Injectable()
export class RecipeStore{
 constructor(private readonly db:PrismaService,private readonly identity:IdentityRepository,
  private readonly engine:InventoryPostingEngine){}
 private async global(u:Principal,permission:string){
  if(!(await this.identity.capabilities(u.id,null)).includes(permission))
   throw new ForbiddenException('Permiso global de recetas requerido');
 }
 private async edit(tx:Tx,u:Principal){
  const role=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},
   sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
    rolPermisosComoRol:{some:{permiso:{codigo:'recipes.manage'}}}}}});
  if(!role)throw new ForbiddenException('Gestión de recetas requiere permiso global');
 }
 private async checkRecipe(tx:Tx,d:{tipo:'VENTA'|'PRODUCCION';varianteId?:string;articuloResultadoId?:string}){
  if(d.tipo==='VENTA'){
   if(!d.varianteId||d.articuloResultadoId)throw new BadRequestException('VENTA requiere varianteId únicamente');
   const variant=await tx.varianteProducto.findUnique({where:{id:d.varianteId},include:{producto:true}});
   if(!variant||!variant.activo||!variant.producto.activo||variant.producto.tipo!=='PREPARADO')
    throw new ConflictException('La variante debe pertenecer a un producto PREPARADO activo');
  }else{
   if(!d.articuloResultadoId||d.varianteId)throw new BadRequestException('PRODUCCION requiere articuloResultadoId únicamente');
   const art=await tx.articuloInventario.findUnique({where:{id:d.articuloResultadoId}});
   if(!art||!art.activo||!['PREPARACION','PRODUCTO_TERMINADO'].includes(art.tipo))
    throw new ConflictException('El resultado debe ser artículo activo de PREPARACION o PRODUCTO_TERMINADO');
  }
 }
 private async validateFormula(tx:Tx,recipe:{tipo:string;articuloResultadoId:string|null},d:VersionDto){
  quantity(d.rendimiento);
  ensureUnique(d.componentes,x=>x.articuloId,'Ingrediente');
  const output=recipe.articuloResultadoId;
  if(output&&d.componentes.some(x=>x.articuloId===output))
   throw new ConflictException('La receta no puede consumirse a sí misma');
  const yieldUnit=await tx.unidadMedida.findUnique({where:{id:d.unidadRendimientoId}});
  if(!yieldUnit)throw new NotFoundException('Unidad de rendimiento inexistente');
  if(recipe.tipo==='PRODUCCION'){
   const article=await tx.articuloInventario.findUnique({where:{id:output!},include:{unidadBase:true}});
   if(!article||article.unidadBase.dimension!==yieldUnit.dimension)
    throw new BadRequestException('El rendimiento no coincide con la dimensión del artículo resultado');
   await toBase(tx,article.id,d.unidadRendimientoId,d.rendimiento);
  }else if(yieldUnit.dimension!=='UNIDAD')throw new BadRequestException('La receta VENTA requiere rendimiento por unidades');
  for(const c of d.componentes){
   quantity(c.cantidad);proportion(c.mermaPorcentaje??'0');
   await toBase(tx,c.articuloId,c.unidadId,c.cantidad);
  }
 }
 private async addVersion(tx:Tx,recipe:{id:string;tipo:string;articuloResultadoId:string|null},
  d:VersionDto){
  await this.validateFormula(tx,recipe,d);
  const last=await tx.recetaVersion.aggregate({where:{recetaId:recipe.id},_max:{numero:true}});
  const next=(last._max.numero??0)+1;
  const v=await tx.recetaVersion.create({data:{
   recetaId:recipe.id,numero:next,rendimiento:new Prisma.Decimal(d.rendimiento),
   unidadRendimientoId:d.unidadRendimientoId,vidaUtilDias:d.vidaUtilDias??null,
   recetaComponentesComoRecetaVersion:{create:d.componentes.map(c=>({
    articuloId:c.articuloId,unidadId:c.unidadId,cantidad:new Prisma.Decimal(c.cantidad),
    mermaPorcentaje:new Prisma.Decimal(c.mermaPorcentaje??0)
   }))}
  }});
  if(d.publicar)await this.publishTx(tx,recipe.id,v.id);
  return v;
 }
 private async publishTx(tx:Tx,recipeId:string,id:string){
  const v=await tx.recetaVersion.findUnique({where:{id},include:{
   receta:true,recetaComponentesComoRecetaVersion:true}});
  if(!v||v.recetaId!==recipeId)throw new NotFoundException('Versión inexistente');
  if(!v.receta.activa)throw new ConflictException('Receta desactivada');
  if(!v.recetaComponentesComoRecetaVersion.length)throw new ConflictException('Versión sin ingredientes');
  if(v.publicadaEn)throw new ConflictException('Versión publicada es inmutable');
  await tx.recetaVersion.updateMany({where:{recetaId:recipeId,activa:true},data:{activa:false}});
  await tx.recetaVersion.update({where:{id},data:{activa:true,publicadaEn:new Date()}});
 }
 async list(u:Principal,q:ListRecipesDto){
  await this.global(u,'recipes.read');
  const where:Prisma.RecetaWhereInput={
   ...(q.tipo?{tipo:q.tipo}:{}),...(q.varianteId?{varianteId:q.varianteId}:{}),
   ...(q.articuloResultadoId?{articuloResultadoId:q.articuloResultadoId}:{}),
   ...(q.search?{nombre:{contains:q.search,mode:'insensitive'}}:{})};
  const [rows,count]=await this.db.$transaction([
   this.db.receta.findMany({where,include:fullRecipe,orderBy:{nombre:'asc'},
    skip:(q.page-1)*q.limit,take:q.limit}),this.db.receta.count({where})]);
  return {data:rows,meta:{page:q.page,limit:q.limit,total:count,totalPages:Math.ceil(count/q.limit)}};
 }
 async options(u:Principal,q:ListRecipesDto){
  const d=await this.list(u,q);
  return {data:d.data.map(x=>({id:x.id,label:x.nombre,tipo:x.tipo,activa:x.activa,
   versionActiva:x.recetaVersionesComoReceta.find(v=>v.activa)?.numero??null})),meta:d.meta};
 }
 async detail(u:Principal,id:string){
  await this.global(u,'recipes.read');
  const row=await this.db.receta.findUnique({where:{id},include:fullRecipe});
  if(!row)throw new NotFoundException('Receta inexistente');
  return row;
 }
 async create(u:Principal,d:CreateRecipeDto){
  await this.global(u,'recipes.manage');
  const name=d.nombre.trim();
  if(name.length<3)throw new BadRequestException('Nombre mínimo 3 caracteres');
  return this.engine.tx(async tx=>{
   await this.edit(tx,u);
   await this.checkRecipe(tx,d);
   const duplicated=await tx.receta.findFirst({where:d.tipo==='VENTA'?
    {tipo:'VENTA',varianteId:d.varianteId}:{tipo:'PRODUCCION',articuloResultadoId:d.articuloResultadoId}});
   if(duplicated)throw new ConflictException('Ya existe una receta para esa variante o artículo');
   const row=await tx.receta.create({data:{nombre:name,tipo:d.tipo,
    varianteId:d.varianteId,articuloResultadoId:d.articuloResultadoId}});
   if(d.version)await this.addVersion(tx,row,d.version);
   await audit(tx,u,'RECIPE_CREATED','Receta',row.id,{tipo:row.tipo,nombre:name});
   return tx.receta.findUniqueOrThrow({where:{id:row.id},include:fullRecipe});
  });
 }
 async update(u:Principal,id:string,d:UpdateRecipeDto){
  await this.global(u,'recipes.manage');
  if(d.nombre===undefined&&d.activa===undefined)throw new BadRequestException('No hay cambios');
  return this.engine.tx(async tx=>{
   await this.edit(tx,u);
   const old=await tx.receta.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Receta inexistente');
   const name=d.nombre?.trim();
   if(name!==undefined&&name.length<3)throw new BadRequestException('Nombre mínimo 3 caracteres');
   const result=await tx.receta.update({where:{id},data:{
    ...(name!==undefined?{nombre:name}:{}),...(d.activa!==undefined?{activa:d.activa}:{})}});
   await audit(tx,u,'RECIPE_UPDATED','Receta',id,{activa:result.activa,nombre:result.nombre});
   return result;
  });
 }
 async newVersion(u:Principal,id:string,d:VersionDto){
  await this.global(u,'recipes.manage');
  return this.engine.tx(async tx=>{
   await this.edit(tx,u);
   const recipe=await tx.receta.findUnique({where:{id}});
   if(!recipe)throw new NotFoundException('Receta inexistente');
   if(!recipe.activa)throw new ConflictException('Receta desactivada');
   const version=await this.addVersion(tx,recipe,d);
   await audit(tx,u,'RECIPE_VERSION_CREATED','RecetaVersion',version.id,{recetaId:id,numero:version.numero});
   return tx.recetaVersion.findUniqueOrThrow({where:{id:version.id},include:{
    unidadRendimiento:true,recetaComponentesComoRecetaVersion:{include:{articulo:true,unidad:true}}}});
  });
 }
 async revise(u:Principal,id:string,d:VersionDto){
  await this.global(u,'recipes.manage');
  return this.engine.tx(async tx=>{
   await this.edit(tx,u);
   const version=await tx.recetaVersion.findUnique({where:{id},include:{receta:true}});
   if(!version)throw new NotFoundException('Versión inexistente');
   if(version.publicadaEn||version.activa)throw new ConflictException('No puede modificarse una versión publicada');
   await this.validateFormula(tx,version.receta,d);
   await tx.recetaComponente.deleteMany({where:{recetaVersionId:id}});
   await tx.recetaVersion.update({where:{id},data:{
    rendimiento:new Prisma.Decimal(d.rendimiento),unidadRendimientoId:d.unidadRendimientoId,
    vidaUtilDias:d.vidaUtilDias??null,
    recetaComponentesComoRecetaVersion:{create:d.componentes.map(c=>({
     articuloId:c.articuloId,unidadId:c.unidadId,cantidad:new Prisma.Decimal(c.cantidad),
     mermaPorcentaje:new Prisma.Decimal(c.mermaPorcentaje??0)}))}
   }});
   if(d.publicar)await this.publishTx(tx,version.recetaId,id);
   await audit(tx,u,'RECIPE_VERSION_UPDATED','RecetaVersion',id);
   return tx.recetaVersion.findUniqueOrThrow({where:{id},include:{
    unidadRendimiento:true,recetaComponentesComoRecetaVersion:{include:{articulo:true,unidad:true}}}});
  });
 }
 async publish(u:Principal,id:string){
  await this.global(u,'recipes.publish');
  return this.engine.tx(async tx=>{
   await this.engine.allowed(tx,u.id,'recipes.publish',(await tx.sucursal.findFirst())?.id??'');
   // Global publication is checked separately, never via an arbitrary branch.
   const role=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,sucursalId:null,
    usuario:{activo:true},rol:{activo:true,alcance:'GLOBAL',
     rolPermisosComoRol:{some:{permiso:{codigo:'recipes.publish'}}}}}});
   if(!role)throw new ForbiddenException('Requiere publicar recetas globalmente');
   const v=await tx.recetaVersion.findUnique({where:{id}});
   if(!v)throw new NotFoundException('Versión inexistente');
   await this.publishTx(tx,v.recetaId,id);
   await audit(tx,u,'RECIPE_VERSION_PUBLISHED','RecetaVersion',id,{recetaId:v.recetaId});
   return tx.recetaVersion.findUniqueOrThrow({where:{id}});
  });
 }
 async coverage(u:Principal){
  await this.global(u,'recipes.read');
  const rows=await this.db.receta.findMany({include:{recetaVersionesComoReceta:true}});
  const variants=await this.db.varianteProducto.count({where:{activo:true,producto:{tipo:'PREPARADO',activo:true}}});
  return {total:rows.length,recetasVenta:rows.filter(x=>x.tipo==='VENTA').length,
   recetasProduccion:rows.filter(x=>x.tipo==='PRODUCCION').length,
   publicadas:rows.filter(x=>x.activa&&x.recetaVersionesComoReceta.some(v=>v.activa&&v.publicadaEn)).length,
   variantesPreparadasActivas:variants,variantesSinRecetaPublicada:Math.max(0,variants-rows.filter(
    x=>x.tipo==='VENTA'&&x.activa&&x.recetaVersionesComoReceta.some(v=>v.activa&&v.publicadaEn)).length)};
 }
 async modifier(u:Principal,id:string){
  await this.global(u,'recipes.read');
  const r=await this.db.modificador.findUnique({where:{id},include:{
   modificadorComponentesComoModificador:{include:{articulo:true,unidad:true,sustituyeArticulo:true}}}});
  if(!r)throw new NotFoundException('Modificador inexistente');
  return r;
 }
 async setModifier(u:Principal,id:string,d:ModifierCompositionDto){
  await this.global(u,'recipes.manage');
  return this.engine.tx(async tx=>{
   await this.edit(tx,u);
   if(!await tx.modificador.findUnique({where:{id}}))throw new NotFoundException('Modificador inexistente');
   ensureUnique(d.componentes,c=>c.articuloId,'Artículo en modificador');
   for(const c of d.componentes){
    quantity(c.cantidad);
    await toBase(tx,c.articuloId,c.unidadId,c.cantidad);
    if(c.efecto==='SUSTITUIR'){
     if(!c.sustituyeArticuloId||c.sustituyeArticuloId===c.articuloId)
      throw new BadRequestException('SUSTITUIR requiere artículo diferente');
     if(!await tx.articuloInventario.findUnique({where:{id:c.sustituyeArticuloId}}))
      throw new NotFoundException('Artículo sustituido no encontrado');
    }else if(c.sustituyeArticuloId)throw new BadRequestException('sustituyeArticuloId solo para SUSTITUIR');
   }
   await tx.modificadorComponente.deleteMany({where:{modificadorId:id}});
   if(d.componentes.length)await tx.modificadorComponente.createMany({data:d.componentes.map(c=>({
    modificadorId:id,articuloId:c.articuloId,unidadId:c.unidadId,
    cantidad:new Prisma.Decimal(c.cantidad),efecto:c.efecto,sustituyeArticuloId:c.sustituyeArticuloId
   }))});
   await audit(tx,u,'RECIPE_MODIFIER_COMPONENTS_UPDATED','Modificador',id,{componentes:d.componentes.length});
   return tx.modificador.findUniqueOrThrow({where:{id},include:{
    modificadorComponentesComoModificador:{include:{articulo:true,unidad:true}}}});
  });
 }
 async packaging(u:Principal,q:PackagingQueryDto){
  await this.global(u,'recipes.read');
  return this.db.reglaEmpaque.findMany({where:{
   ...(q.sucursalId?{OR:[{sucursalId:q.sucursalId},{sucursalId:null}]}:{}),
   ...(q.varianteId?{OR:[{varianteId:q.varianteId},{varianteId:null}]}:{})
  },include:{reglaEmpaqueLineasComoRegla:{include:{articulo:true}},variante:true,sucursal:true},
   orderBy:{nombre:'asc'}});
 }
 async createPackaging(u:Principal,d:PackagingRuleDto){
  await this.global(u,'recipes.manage');
  return this.engine.tx(async tx=>{
   await this.edit(tx,u);
   if(d.alcance==='ARTICULO'&&!d.varianteId)throw new BadRequestException('ARTICULO requiere varianteId');
   if(d.alcance==='ORDEN'&&d.varianteId)throw new BadRequestException('ORDEN no recibe varianteId');
   ensureUnique(d.lineas,x=>x.articuloId,'Artículo de empaque');
   for(const item of d.lineas){
    quantity(item.cantidad);
    const art=await tx.articuloInventario.findUnique({where:{id:item.articuloId}});
    if(!art||!art.activo||art.tipo!=='EMPAQUE')throw new ConflictException('Material debe ser un artículo EMPAQUE activo');
   }
   if(d.varianteId&&!await tx.varianteProducto.findUnique({where:{id:d.varianteId}}))
    throw new NotFoundException('Variante inexistente');
   if(d.sucursalId&&!await tx.sucursal.findUnique({where:{id:d.sucursalId}}))
    throw new NotFoundException('Sucursal inexistente');
   const rule=await tx.reglaEmpaque.create({data:{nombre:d.nombre.trim(),alcance:d.alcance,
    modalidad:d.modalidad,varianteId:d.varianteId,sucursalId:d.sucursalId,
    reglaEmpaqueLineasComoRegla:{create:d.lineas.map(l=>({
     articuloId:l.articuloId,cantidad:new Prisma.Decimal(l.cantidad)}))}}});
   await audit(tx,u,'PACKAGING_RULE_CREATED','ReglaEmpaque',rule.id);
   return tx.reglaEmpaque.findUniqueOrThrow({where:{id:rule.id},
    include:{reglaEmpaqueLineasComoRegla:{include:{articulo:true}}}});
  });
 }
}
