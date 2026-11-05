import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import type {ProductSetupDto,PriceCreateDto,MenuLayoutDto,QuickModifierGroupDto} from '../presentation/http/dto/catalog.dto.js';
import {bounds,catalogCode,catalogName,decimalPrice,period,validSchedule} from '../domain/catalog.policy.js';
import {activeBranch,audit,failUnique,menuInclude,permission,productInclude,serial,validateLink} from '../infrastructure/prisma/catalog-prisma.shared.js';
import {CatalogMenuStore} from '../infrastructure/prisma/catalog-menu.store.js';
import {toBase} from '../../recipes/infrastructure/prisma/recipe-units.js';

/** Task-level operations for the guided editor; every operation is one serializable transaction. */
@Injectable()
export class CatalogSetupService{
 constructor(private readonly db:PrismaService,private readonly menus:CatalogMenuStore){}


 /** Atomic group, modifiers, additive ingredient composition and optional assignment.
  * No stock movements occur here. Removal/substitution requires the advanced editor. */
 async createModifierGroupWithOptions(actor:string,dto:QuickModifierGroupDto){
  bounds(dto.minimo,dto.maximo);
  if(!dto.opciones.length||dto.opciones.length>30)
   throw new BadRequestException('Incluye de 1 a 30 opciones');
  if(dto.minimo>dto.opciones.length||dto.maximo!==undefined&&dto.maximo!==null&&dto.maximo>dto.opciones.length)
   throw new BadRequestException('Los límites superan la cantidad de opciones');
  const names=dto.opciones.map(x=>catalogName(x.nombre).toLocaleLowerCase('es'));
  if(new Set(names).size!==names.length)throw new ConflictException('Hay opciones repetidas');
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   if(dto.opciones.some(o=>o.ingredientes.length))
    await permission(tx,actor,'recipes.manage',null);
   if(dto.varianteId){
    const variant=await tx.varianteProducto.findUnique({
     where:{id:dto.varianteId},include:{producto:true}});
    if(!variant||!variant.activo||!variant.producto.activo)
     throw new NotFoundException('Presentación inactiva o inexistente');
    if(dto.opciones.some(o=>o.ingredientes.length)&&variant.producto.tipo!=='PREPARADO')
     throw new ConflictException('Solo preparados pueden vincular extras que consumen ingredientes');
   }
   const group=await tx.grupoModificador.create({data:{
    nombre:catalogName(dto.nombre),minimo:dto.minimo,maximo:dto.maximo??null
   }});
   const options=[];
   for(const option of dto.opciones){
    const unique=new Set<string>();
    for(const item of option.ingredientes){
     if(unique.has(item.articuloId))
      throw new ConflictException('Ingrediente repetido en la opción');
     unique.add(item.articuloId);
     if(item.efecto!=='SUMAR')
      throw new BadRequestException('Para retirar o sustituir ingredientes usa la composición avanzada');
     await toBase(tx,item.articuloId,item.unidadId,item.cantidad);
    }
    const extra=await tx.modificador.create({data:{
     grupoId:group.id,nombre:catalogName(option.nombre),
     incrementoPrecio:decimalPrice(option.incrementoPrecio),
     requiereComposicion:option.ingredientes.length>0
    }});
    if(option.ingredientes.length)await tx.modificadorComponente.createMany({data:
     option.ingredientes.map(c=>({
      modificadorId:extra.id,articuloId:c.articuloId,unidadId:c.unidadId,
      cantidad:new Prisma.Decimal(c.cantidad),efecto:'SUMAR' as const
     }))});
    options.push({id:extra.id,nombre:extra.nombre,
     incrementoPrecio:extra.incrementoPrecio.toFixed(2),
     requiereComposicion:extra.requiereComposicion});
   }
   if(dto.varianteId){
    const prior=await tx.varianteGrupoModificador.findMany({
     where:{varianteId:dto.varianteId},select:{orden:true}});
    await tx.varianteGrupoModificador.create({data:{
     varianteId:dto.varianteId,grupoId:group.id,
     orden:prior.length?Math.max(...prior.map(x=>x.orden))+1:0,obligatorio:group.minimo>0
    }});
   }
   await audit(tx,actor,'MODIFIER_GROUP_SETUP_CREATED','GrupoModificador',group.id,null,null,{
    nombre:group.nombre,opciones:options.length,varianteId:dto.varianteId??null,
    opcionesConConsumo:options.filter(o=>o.requiereComposicion).length
   });
   return {id:group.id,nombre:group.nombre,minimo:group.minimo,maximo:group.maximo,
    activo:true,opciones:options,asignadoAVarianteId:dto.varianteId??null};
  },serial);}catch(e){failUnique(e);}
 }

 async createProductSetup(actor:string,input:ProductSetupDto){
  if(!input.variantes.length||input.variantes.length>50)
   throw new BadRequestException('Agrega entre 1 y 50 presentaciones');
  const names=input.variantes.map(v=>catalogName(v.nombre).toLocaleLowerCase('es'));
  if(new Set(names).size!==names.length)throw new ConflictException('Presentaciones repetidas');
  if(input.variantes.some(v=>!!v.precio)&&!input.sucursalId)
   throw new BadRequestException('Selecciona una sucursal para registrar precios');
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   if(input.categoriaId){
    const category=await tx.categoria.findUnique({where:{id:input.categoriaId,activa:true}});
    if(!category)throw new ConflictException('Categoría inactiva o inexistente');
   }
   if(input.sucursalId&&input.variantes.some(v=>!!v.precio)){
    await permission(tx,actor,'catalog.prices.manage',input.sucursalId);
    await activeBranch(tx,input.sucursalId);
   }
   const product=await tx.producto.create({data:{
    codigo:catalogCode(input.codigo),nombre:catalogName(input.nombre),
    descripcion:input.descripcion??null,categoriaId:input.categoriaId??null,tipo:input.tipo
   }});
   const registeredPrices:Array<{varianteId:string;nombre:string;importe:string;sucursalId:string}>=[];
   for(const [index,v] of input.variantes.entries()){
    if(v.nuevoArticulo&&v.articuloInventarioId)
     throw new BadRequestException('Elige artículo existente O crear uno nuevo');
    if(v.nuevoArticulo&&input.tipo!=='INVENTARIABLE')
     throw new BadRequestException('Solo los inventariables crean artículos físicos');
    let articleId=v.articuloInventarioId??null;
    if(v.nuevoArticulo){
     await permission(tx,actor,'inventory.articles.manage',null);
     const unit=v.nuevoArticulo.unidadBaseId?
      await tx.unidadMedida.findUnique({where:{id:v.nuevoArticulo.unidadBaseId}}):
      await tx.unidadMedida.findFirst({where:{dimension:'UNIDAD',esBase:true}});
     if(!unit||unit.dimension!=='UNIDAD')
      throw new ConflictException('Configura una unidad base de tipo UNIDAD antes de crear artículos');
     if(v.nuevoArticulo.requiereVencimiento&&!v.nuevoArticulo.requiereLote)
      throw new BadRequestException('El seguimiento de vencimiento requiere control de lote');
     const article=await tx.articuloInventario.create({data:{
      codigo:catalogCode(v.nuevoArticulo.codigo),nombre:catalogName(v.nuevoArticulo.nombre),
      tipo:'PRODUCTO_TERMINADO',unidadBaseId:unit.id,requiereLote:v.nuevoArticulo.requiereLote??false,
      requiereVencimiento:v.nuevoArticulo.requiereVencimiento??false
     }});
     articleId=article.id;
     await audit(tx,actor,'ARTICLE_CREATED','ArticuloInventario',article.id,null,null,
      {codigo:article.codigo,nombre:article.nombre,tipo:article.tipo,stockInicial:'0'});
    }
    await validateLink(tx,input.tipo,articleId);
    if(input.tipo==='INVENTARIABLE'&&articleId){
     const physical=await tx.articuloInventario.findUnique({where:{id:articleId},
      include:{unidadBase:true}});
     if(physical?.unidadBase.dimension!=='UNIDAD')
      throw new ConflictException('Este producto terminado debe medirse en unidades. Selecciona otro artículo.');
    }
    const variant=await tx.varianteProducto.create({data:{
     productoId:product.id,nombre:catalogName(v.nombre),sku:v.sku?catalogCode(v.sku):null,
     articuloInventarioId:articleId,orden:v.orden??index
    }});
    if(v.precio!==undefined&&v.precio!==''){
     if(!input.sucursalId)throw new BadRequestException('Precio sin sucursal');
     const price=await tx.precioVariante.create({data:{
      varianteId:variant.id,sucursalId:input.sucursalId,importe:decimalPrice(v.precio),
      vigenteDesde:new Date()
     }});
     await audit(tx,actor,'VARIANT_PRICE_CREATED','PrecioVariante',price.id,input.sucursalId,null,
      {varianteId:variant.id,importe:price.importe.toFixed(2)});
     registeredPrices.push({varianteId:variant.id,nombre:variant.nombre,
      importe:price.importe.toFixed(2),sucursalId:input.sucursalId});
    }
   }
   await audit(tx,actor,'PRODUCT_SETUP_CREATED','Producto',product.id,null,null,{
    nombre:product.nombre,tipo:product.tipo,variantes:input.variantes.length,
    articulosNuevos:input.variantes.filter(v=>!!v.nuevoArticulo).length,
    precios:registeredPrices.length
   });
   const full=await tx.producto.findUniqueOrThrow({where:{id:product.id},include:productInclude});
   return {...full,preciosConfigurados:registeredPrices};
  },serial);}catch(e){failUnique(e);}
 }

 async batchVariantPrices(actor:string,prices:PriceCreateDto[]){
  if(!prices.length||prices.length>50)throw new BadRequestException('Se permiten 1 a 50 precios');
  const keys=prices.map(p=>p.entityId+'|'+p.sucursalId);
  if(new Set(keys).size!==keys.length)throw new BadRequestException('Presentación y sucursal repetidas');
  try{return await this.db.$transaction(async tx=>{
   const results=[];
   for(const p of prices){
    await permission(tx,actor,'catalog.prices.manage',p.sucursalId);
    await activeBranch(tx,p.sucursalId);
    const variant=await tx.varianteProducto.findUnique({where:{id:p.entityId},include:{producto:true}});
    if(!variant||!variant.activo||!variant.producto.activo)
     throw new ConflictException('Presentación o producto inactivo');
    const from=new Date(p.vigenteDesde),to=p.vigenteHasta?new Date(p.vigenteHasta):null;
    period(from,to);
    const prev=await tx.precioVariante.findFirst({where:{
     varianteId:p.entityId,sucursalId:p.sucursalId,vigenteHasta:null,vigenteDesde:{lt:from}
    },orderBy:{vigenteDesde:'desc'}});
    if(prev)await tx.precioVariante.update({where:{id:prev.id},data:{vigenteHasta:from}});
    const row=await tx.precioVariante.create({data:{
     varianteId:p.entityId,sucursalId:p.sucursalId,importe:decimalPrice(p.importe),
     vigenteDesde:from,vigenteHasta:to
    }});
    await audit(tx,actor,'VARIANT_PRICE_CREATED','PrecioVariante',row.id,p.sucursalId,null,
     {varianteId:p.entityId,importe:row.importe.toFixed(2),vigenteDesde:from.toISOString()});
    results.push({id:row.id,varianteId:row.varianteId,sucursalId:row.sucursalId,
     importe:row.importe.toFixed(2)});
   }
   return {guardados:results.length,precios:results};
  },serial);}catch(e){failUnique(e);}
 }

 /**
  * Read-only review for the actual unsaved menu layout; never publish or mutate.
  * commitMenu remains the authoritative atomic check in its own transaction.
  */
 async previewMenuReadiness(actor:string,id:string,input:MenuLayoutDto){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   const menu=await tx.menu.findUnique({where:{id},select:{
    id:true,nombre:true,version:true,activo:true,publicadoEn:true
   }});
   if(!menu)throw new NotFoundException('Menú inexistente');
   if(menu.version!==input.expectedVersion)
    throw new ConflictException('La carta cambió. Recarga antes de publicarla');
   type Problem={codigo:string;mensaje:string;varianteId?:string;
    nombre?:string;sucursalId?:string;seccion?:string};
   const problemas:Problem[]=[];
   if(!menu.activo)problemas.push({codigo:'MENU_INACTIVO',mensaje:'Activa la carta antes de publicarla'});
   if(!input.sucursalIds.length)
    problemas.push({codigo:'SIN_SUCURSAL',mensaje:'Selecciona al menos una sucursal'});
   if(!input.secciones.length)
    problemas.push({codigo:'SIN_SECCIONES',mensaje:'Agrega una sección a la carta'});
   const nameSet=new Set<string>();
   const itemSet=new Set<string>();
   const sectionNames=new Map<string,string>();
   for(const section of input.secciones){
    const name=catalogName(section.nombre);
    if(nameSet.has(name.toLocaleLowerCase('es')))
     problemas.push({codigo:'SECCION_REPETIDA',mensaje:'Hay secciones con el mismo nombre',seccion:name});
    nameSet.add(name.toLocaleLowerCase('es'));
    if(!section.items.length)problemas.push({codigo:'SECCION_VACIA',
     mensaje:'Agrega productos a esta sección',seccion:name});
    const within=new Set<string>();
    for(const item of section.items){
     if(within.has(item.varianteId))problemas.push({codigo:'VARIANTE_REPETIDA',
      mensaje:'La presentación está repetida en la sección',seccion:name,varianteId:item.varianteId});
     within.add(item.varianteId);itemSet.add(item.varianteId);
     sectionNames.set(item.varianteId,name);
    }
   }
   if(!itemSet.size)problemas.push({codigo:'SIN_PRODUCTOS',mensaje:'Agrega al menos un producto a la carta'});
   const branches=await tx.sucursal.findMany({where:{id:{in:input.sucursalIds}},
    select:{id:true,nombre:true,activa:true}});
   const branchMap=new Map(branches.map(b=>[b.id,b]));
   for(const id of input.sucursalIds){
    const branch=branchMap.get(id);
    if(!branch?.activa)problemas.push({codigo:'SUCURSAL_INACTIVA',sucursalId:id,
     mensaje:'Sucursal inexistente o inactiva'});
   }
   for(const h of input.horarios)validSchedule(h.diaSemana,h.desde,h.hasta);
   // Limit read complexity to guard against a malicious editor creating huge preview requests.
   if(itemSet.size*Math.max(1,input.sucursalIds.length)>300)
    throw new BadRequestException('La revisión permite hasta 300 combinaciones de presentación y sucursal');
   const variants=await tx.varianteProducto.findMany({where:{id:{in:[...itemSet]}},
    select:{id:true,nombre:true,producto:{select:{nombre:true}}}});
   const variantMap=new Map(variants.map(v=>[v.id,v]));
   const checked:Array<{varianteId:string;nombre:string;sucursalId:string;
    sucursal:string;seccion:string;lista:boolean;advertencias:string[]}>=[];
   for(const id of itemSet){
    const v=variantMap.get(id);
    if(!v){problemas.push({codigo:'VARIANTE_NO_EXISTE',varianteId:id,
     seccion:sectionNames.get(id),mensaje:'El producto ya no existe. Retíralo de la sección'});continue;}
    for(const branchId of input.sucursalIds){
     const branch=branchMap.get(branchId);
     if(!branch?.activa)continue;
     const state=await this.menus.readiness(id,branchId,new Date(),tx);
     checked.push({varianteId:id,nombre:v.producto.nombre+' · '+v.nombre,
      sucursalId:branchId,sucursal:branch.nombre,seccion:sectionNames.get(id)??'',
      lista:state.lista,advertencias:state.advertencias});
     for(const code of state.advertencias)problemas.push({codigo:code,
      mensaje:code,varianteId:id,nombre:v.producto.nombre+' · '+v.nombre,
      sucursalId:branchId,seccion:sectionNames.get(id)});
    }
   }
   return {menuId:id,versionActual:menu.version,publicada:!!menu.publicadoEn,
    lista:problemas.length===0,problemas,comprobadas:checked,
    totalPresentaciones:itemSet.size,totalSucursales:input.sucursalIds.length};
  },serial);
 }

 async commitMenu(actor:string,id:string,input:MenuLayoutDto){
  const allIds=[...new Set(input.secciones.flatMap(s=>s.items.map(x=>x.varianteId)))];
  if(!input.sucursalIds.length||!input.secciones.length||!allIds.length)
   throw new BadRequestException('La carta publicada necesita sucursal, sección y productos');
  const names=input.secciones.map(s=>catalogName(s.nombre).toLocaleLowerCase('es'));
  if(new Set(names).size!==names.length)throw new ConflictException('Secciones repetidas');
  if(new Set(input.sucursalIds).size!==input.sucursalIds.length)throw new ConflictException('Sucursales repetidas');
  for(const s of input.secciones){
   if(new Set(s.items.map(x=>x.varianteId)).size!==s.items.length)
    throw new ConflictException('Una presentación está repetida en su sección');
  }
  for(const h of input.horarios)validSchedule(h.diaSemana,h.desde,h.hasta);
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.menus.manage',null);
   const before=await tx.menu.findUnique({where:{id}});
   if(!before)throw new NotFoundException('Menú inexistente');
   if(!before.activo)throw new ConflictException('Activa el menú antes de publicarlo');
   for(const branch of input.sucursalIds)await activeBranch(tx,branch);
   const present=await tx.varianteProducto.findMany({where:{id:{in:allIds}}});
   if(present.length!==allIds.length)throw new ConflictException('Presentación inexistente');
   const updated=await tx.menu.updateMany({where:{id,version:input.expectedVersion},
    data:{version:{increment:1}}});
   if(updated.count!==1)throw new ConflictException('El menú cambió; actualiza la pantalla antes de continuar');
   await tx.menuSeccion.deleteMany({where:{menuId:id}});
   await tx.menuHorario.deleteMany({where:{menuId:id}});
   await tx.menuSucursal.deleteMany({where:{menuId:id}});
   await tx.menuSucursal.createMany({data:input.sucursalIds.map(sucursalId=>({menuId:id,sucursalId}))});
   if(input.horarios.length)await tx.menuHorario.createMany({data:input.horarios.map(h=>({menuId:id,...h}))});
   for(const section of input.secciones){
    await tx.menuSeccion.create({data:{menuId:id,nombre:catalogName(section.nombre),
     orden:section.orden,items:{create:section.items.map(x=>({varianteId:x.varianteId,orden:x.orden}))}}});
   }
   for(const branch of input.sucursalIds){
    for(const variantId of allIds){
     const ready=await this.menus.readiness(variantId,branch,new Date(),tx);
     if(!ready.lista)throw new ConflictException(
      'No se puede publicar: '+ready.advertencias.join(', ')+' (presentación '+variantId+')');
    }
   }
   await tx.menu.update({where:{id},data:{publicadoEn:new Date()}});
   await audit(tx,actor,'MENU_LAYOUT_COMMITTED','Menu',id,null,
    {version:before.version,publicado:!!before.publicadoEn},
    {version:before.version+1,publicado:true,secciones:input.secciones.length});
   return tx.menu.findUniqueOrThrow({where:{id},include:menuInclude});
  },serial);}catch(e){failUnique(e);}
 }
}
