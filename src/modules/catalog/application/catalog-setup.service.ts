import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import type {ProductSetupDto,PriceCreateDto,MenuLayoutDto} from '../presentation/http/dto/catalog.dto.js';
import {catalogCode,catalogName,decimalPrice,period,validSchedule} from '../domain/catalog.policy.js';
import {activeBranch,audit,failUnique,menuInclude,permission,productInclude,serial,validateLink} from '../infrastructure/prisma/catalog-prisma.shared.js';
import {CatalogMenuStore} from '../infrastructure/prisma/catalog-menu.store.js';

/** Task-level operations for the guided editor; every operation is one serializable transaction. */
@Injectable()
export class CatalogSetupService{
 constructor(private readonly db:PrismaService,private readonly menus:CatalogMenuStore){}

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
