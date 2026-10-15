import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {Paging,Options,CategoryInput,ProductInput,VariantInput,CatalogKind} from '../../application/ports/catalog.repository.port.js';
import {catalogCode,catalogName,requireInventoryLink} from '../../domain/catalog.policy.js';
import {activeBranch,audit,categoryInclude,failUnique,permission,productInclude,serial,validateLink,variantInclude,variantPrice} from './catalog-prisma.shared.js';
@Injectable()
export class CatalogCommercialStore{
 constructor(private readonly db:PrismaService){}
 async categories(f:Paging){
  const where:Prisma.CategoriaWhereInput={
   ...(f.activo===undefined?{}:{activa:f.activo}),
   ...(f.search?{nombre:{contains:f.search,mode:'insensitive'}}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.categoria.findMany({where,include:categoryInclude,orderBy:[{orden:'asc'},{nombre:'asc'}],
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.categoria.count({where})]);
  return {data:rows,total};
 }
 async categoryOptions(f:Options){
  const where:Prisma.CategoriaWhereInput={activa:true,
   ...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{nombre:{contains:f.search,mode:'insensitive'}}:{})
  };
  const rows=await this.db.categoria.findMany({where,orderBy:{id:'asc'},take:f.limit+1});
  return {data:rows.slice(0,f.limit).map(x=>({id:x.id,label:x.nombre,parentId:x.parentId})),
   nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async categoryTree(){
  const rows=await this.db.categoria.findMany({include:categoryInclude,orderBy:[{orden:'asc'},{nombre:'asc'}]});
  const map=new Map<string,{id:string;nombre:string;orden:number;activa:boolean;imagenes:unknown;children:unknown[];totalProductos:number}>();
  for(const x of rows)map.set(x.id,{id:x.id,nombre:x.nombre,orden:x.orden,activa:x.activa,imagenes:x.medios,children:[],totalProductos:x._count.productosComoCategoria});
  const roots:unknown[]=[];
  for(const x of rows){
   const item=map.get(x.id)!;
   const parent=x.parentId?map.get(x.parentId):null;
   if(parent)parent.children.push(item);else roots.push(item);
  }
  return {data:roots,total:rows.length};
 }
 async category(id:string){return this.db.categoria.findUnique({where:{id},include:categoryInclude});}
 private async parentCheck(tx:Prisma.TransactionClient,id:string|null|undefined,exclude?:string){
  if(!id)return;
  const seen=new Set<string>([exclude??'']);
  let current:string|null=id;
  for(let depth=0;current&&depth<100;depth++){
   if(seen.has(current))throw new ConflictException('Jerarquía circular');
   seen.add(current);
   const row: {parentId:string|null;activa:boolean}|null=await tx.categoria.findUnique({
    where:{id:current},select:{parentId:true,activa:true}});
   if(!row)throw new NotFoundException('Categoría padre inexistente');
   if(!row.activa)throw new ConflictException('Categoría padre inactiva');
   current=row.parentId;
  }
  if(current)throw new ConflictException('Jerarquía demasiado profunda');
 }
 async createCategory(actor:string,input:CategoryInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   await this.parentCheck(tx,input.parentId);
   const row=await tx.categoria.create({data:{nombre:catalogName(input.nombre),parentId:input.parentId??null,
    orden:input.orden??0},include:categoryInclude});
   await audit(tx,actor,'CATEGORY_CREATED','Categoria',row.id,null,null,{nombre:row.nombre,parentId:row.parentId});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async updateCategory(actor:string,id:string,input:Partial<CategoryInput>){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const old=await tx.categoria.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Categoría inexistente');
   if(input.parentId!==undefined)await this.parentCheck(tx,input.parentId,id);
   const row=await tx.categoria.update({where:{id},data:{...input,
    nombre:input.nombre===undefined?undefined:catalogName(input.nombre)},include:categoryInclude});
   await audit(tx,actor,'CATEGORY_UPDATED','Categoria',id,null,
    {nombre:old.nombre,parentId:old.parentId,orden:old.orden},
    {nombre:row.nombre,parentId:row.parentId,orden:row.orden});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async statusCategory(actor:string,id:string,activo:boolean,motivo:string){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const old=await tx.categoria.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Categoría inexistente');
   if(!activo){
    const [children,products]=await Promise.all([
     tx.categoria.count({where:{parentId:id,activa:true}}),
     tx.producto.count({where:{categoriaId:id,activo:true}})
    ]);
    if(children+products)throw new ConflictException('Categoría con elementos activos');
   }else await this.parentCheck(tx,old.parentId);
   const row=await tx.categoria.update({where:{id},data:{activa:activo},include:categoryInclude});
   if(old.activa!==activo)await audit(tx,actor,activo?'CATEGORY_ACTIVATED':'CATEGORY_DEACTIVATED',
    'Categoria',id,null,{activa:old.activa},{activa:activo},motivo);
   return row;
  },serial);
 }
 async products(f:Paging&{categoriaId?:string;tipo?:CatalogKind}){
  const where:Prisma.ProductoWhereInput={...(f.activo===undefined?{}:{activo:f.activo}),
   ...(f.categoriaId?{categoriaId:f.categoriaId}:{}),...(f.tipo?{tipo:f.tipo}:{}),
   ...(f.search?{OR:[{codigo:{contains:f.search,mode:'insensitive'}},
    {nombre:{contains:f.search,mode:'insensitive'}}]}:{})};
  const [rows,total]=await this.db.$transaction([
   this.db.producto.findMany({where,include:productInclude,orderBy:[{creadoEn:'desc'},{id:'desc'}],
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.producto.count({where})]);
  return {data:rows,total};
 }
 async productOptions(f:Options&{sucursalId?:string}){
  const where:Prisma.ProductoWhereInput={activo:true,
   ...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{OR:[{codigo:{contains:f.search,mode:'insensitive'}},
    {nombre:{contains:f.search,mode:'insensitive'}}]}:{})};
  const rows=await this.db.producto.findMany({where,include:{
   categoria:{select:{id:true,nombre:true}},medios:{include:{media:true},orderBy:{orden:'asc'}},
   varianteProductosComoProducto:{where:{activo:true},select:{id:true,nombre:true}}
  },orderBy:{id:'asc'},take:f.limit+1});
  return {data:rows.slice(0,f.limit).map(x=>({...x,label:x.nombre})),
   nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async product(id:string,sucursalId?:string){
  const row=await this.db.producto.findUnique({where:{id},include:productInclude});
  if(!row||!sucursalId)return row;
  const prices=await this.db.precioVariante.findMany({where:{
   varianteId:{in:row.varianteProductosComoProducto.map(x=>x.id)},sucursalId,
   vigenteDesde:{lte:new Date()},OR:[{vigenteHasta:null},{vigenteHasta:{gt:new Date()}}]
  }});
  const priceMap=new Map(prices.map(p=>[p.varianteId,p.importe.toFixed(2)]));
  return {...row,variantesPrecios:row.varianteProductosComoProducto.map(v=>({
   varianteId:v.id,importe:priceMap.get(v.id)??null,sucursalId
  }))};
 }
 async createProduct(actor:string,input:ProductInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   if(input.categoriaId){
    const cat=await tx.categoria.findUnique({where:{id:input.categoriaId}});
    if(!cat||!cat.activa)throw new ConflictException('Categoría inexistente o inactiva');
   }
   const variants=input.variantes??[];
   for(const v of variants)await validateLink(tx,input.tipo,v.articuloInventarioId);
   const uniq=new Set(variants.map(x=>catalogName(x.nombre).toLowerCase()));
   if(uniq.size!==variants.length)throw new ConflictException('Nombres de variante duplicados');
   const row=await tx.producto.create({data:{
    codigo:catalogCode(input.codigo),nombre:catalogName(input.nombre),descripcion:input.descripcion,
    tipo:input.tipo,categoriaId:input.categoriaId,
    varianteProductosComoProducto:{create:variants.map((v,i)=>({
     nombre:catalogName(v.nombre),sku:v.sku?catalogCode(v.sku):null,
     articuloInventarioId:v.articuloInventarioId??null,orden:v.orden??i
    }))}
   },include:productInclude});
   await audit(tx,actor,'PRODUCT_CREATED','Producto',row.id,null,null,
    {codigo:row.codigo,nombre:row.nombre,tipo:row.tipo,variantes:row.varianteProductosComoProducto.length});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async updateProduct(actor:string,id:string,input:{nombre?:string;descripcion?:string|null;categoriaId?:string|null;visibleEnMenu?:boolean}){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const old=await tx.producto.findUnique({where:{id},include:{
    medios:{include:{media:true}},varianteProductosComoProducto:true}});
   if(!old)throw new NotFoundException('Producto inexistente');
   if(input.categoriaId){
    const cat=await tx.categoria.findUnique({where:{id:input.categoriaId}});
    if(!cat||!cat.activa)throw new ConflictException('Categoría inactiva');
   }
   if(input.visibleEnMenu===true&&!old.visibleEnMenu){
    const photos=old.medios.some(x=>x.media.tipo==='IMAGEN'&&!!x.media.confirmadaEn&&!x.media.eliminadaEn);
    if(!photos)throw new ConflictException('Producto visible requiere fotografía confirmada');
    if(!old.varianteProductosComoProducto.some(x=>x.activo))throw new ConflictException('Producto sin variantes activas');
   }
   const row=await tx.producto.update({where:{id},data:{
    ...input,nombre:input.nombre===undefined?undefined:catalogName(input.nombre)
   },include:productInclude});
   await audit(tx,actor,'PRODUCT_UPDATED','Producto',id,null,
    {nombre:old.nombre,descripcion:old.descripcion,categoriaId:old.categoriaId,visibleEnMenu:old.visibleEnMenu},
    {nombre:row.nombre,descripcion:row.descripcion,categoriaId:row.categoriaId,visibleEnMenu:row.visibleEnMenu});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async statusProduct(actor:string,id:string,activo:boolean,motivo:string){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const old=await tx.producto.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Producto inexistente');
   const row=await tx.producto.update({where:{id},data:{
    activo,visibleEnMenu:activo?old.visibleEnMenu:false},include:productInclude});
   if(old.activo!==activo)await audit(tx,actor,activo?'PRODUCT_ACTIVATED':'PRODUCT_DEACTIVATED',
    'Producto',id,null,{activo:old.activo},{activo},motivo);
   return row;
  },serial);
 }
 async createVariant(actor:string,productId:string,input:VariantInput){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const product=await tx.producto.findUnique({where:{id:productId}});
   if(!product||!product.activo)throw new ConflictException('Producto inexistente o inactivo');
   await validateLink(tx,product.tipo,input.articuloInventarioId);
   const row=await tx.varianteProducto.create({data:{
    productoId:productId,nombre:catalogName(input.nombre),sku:input.sku?catalogCode(input.sku):null,
    articuloInventarioId:input.articuloInventarioId??null,orden:input.orden??0
   },include:variantInclude});
   await audit(tx,actor,'VARIANT_CREATED','VarianteProducto',row.id,null,null,
    {nombre:row.nombre,productoId:productId,sku:row.sku});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async updateVariant(actor:string,id:string,input:Partial<VariantInput>&{activo?:boolean}){
  try{return await this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const old=await tx.varianteProducto.findUnique({where:{id},include:{producto:true}});
   if(!old)throw new NotFoundException('Variante inexistente');
   await validateLink(tx,old.producto.tipo,
    input.articuloInventarioId===undefined?old.articuloInventarioId:input.articuloInventarioId);
   if(input.activo===false&&await tx.menuItem.count({where:{varianteId:id,activo:true,
    seccion:{menu:{publicadoEn:{not:null}}}}}))
    throw new ConflictException('Quite primero la variante de los menús publicados');
   if(input.articuloInventarioId!==undefined&&input.articuloInventarioId!==old.articuloInventarioId&&
    await tx.ordenLinea.count({where:{varianteId:id}}))
    throw new ConflictException('No cambiar artículo físico de variante con historial de ventas');
   const row=await tx.varianteProducto.update({where:{id},data:{
    ...input,nombre:input.nombre===undefined?undefined:catalogName(input.nombre),
    sku:input.sku===undefined?undefined:input.sku?catalogCode(input.sku):null
   },include:variantInclude});
   await audit(tx,actor,'VARIANT_UPDATED','VarianteProducto',id,null,
    {nombre:old.nombre,sku:old.sku,orden:old.orden,activo:old.activo},
    {nombre:row.nombre,sku:row.sku,orden:row.orden,activo:row.activo});
   return row;
  },serial);}catch(e){failUnique(e);}
 }
 async variant(id:string,sucursalId?:string){
  const row=await this.db.varianteProducto.findUnique({where:{id},include:variantInclude});
  if(!row||!sucursalId)return row;
  const [price,availability]=await Promise.all([
   variantPrice(this.db,id,sucursalId,new Date()),
   this.db.varianteSucursal.findUnique({where:{varianteId_sucursalId:{varianteId:id,sucursalId}}})
  ]);
  return {...row,precioVigente:price?.importe.toFixed(2)??null,
   habilitadaSucursal:availability?.habilitada??true,pausadaHasta:availability?.pausadaHasta??null};
 }
 async variantOptions(f:Options&{productoId?:string;sucursalId?:string}){
  const where:Prisma.VarianteProductoWhereInput={activo:true,producto:{activo:true},
   ...(f.productoId?{productoId:f.productoId}:{}),...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {sku:{contains:f.search,mode:'insensitive'}},
    {producto:{nombre:{contains:f.search,mode:'insensitive'}}}]}:{})};
  const rows=await this.db.varianteProducto.findMany({where,include:variantInclude,orderBy:{id:'asc'},take:f.limit+1});
  const sliced=rows.slice(0,f.limit);
  const prices=f.sucursalId?await this.db.precioVariante.findMany({where:{
   sucursalId:f.sucursalId,varianteId:{in:sliced.map(x=>x.id)},vigenteDesde:{lte:new Date()},
   OR:[{vigenteHasta:null},{vigenteHasta:{gt:new Date()}}]
  }}):[];
  const map=new Map(prices.map(x=>[x.varianteId,x.importe.toFixed(2)]));
  return {data:sliced.map(r=>({...r,label:`${r.producto.nombre} · ${r.nombre}`,
   precioVigente:f.sucursalId?map.get(r.id)??null:undefined})),
   nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async variantBranch(actor:string,id:string,sucursalId:string,input:{habilitada:boolean;pausadaHasta?:string|null;motivo?:string|null}){
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',sucursalId);
   await activeBranch(tx,sucursalId);
   if(!await tx.varianteProducto.findUnique({where:{id}}))throw new NotFoundException('Variante inexistente');
   const old=await tx.varianteSucursal.findUnique({where:{varianteId_sucursalId:{varianteId:id,sucursalId}}});
   const row=await tx.varianteSucursal.upsert({where:{varianteId_sucursalId:{varianteId:id,sucursalId}},
    create:{varianteId:id,sucursalId,habilitada:input.habilitada,
     pausadaHasta:input.pausadaHasta?new Date(input.pausadaHasta):null,motivo:input.motivo},
    update:{habilitada:input.habilitada,pausadaHasta:input.pausadaHasta?new Date(input.pausadaHasta):null,
     motivo:input.motivo}
   });
   await audit(tx,actor,'VARIANT_BRANCH_UPDATED','VarianteSucursal',id,sucursalId,
    old?{habilitada:old.habilitada,pausadaHasta:old.pausadaHasta}:null,
    {habilitada:row.habilitada,pausadaHasta:row.pausadaHasta},input.motivo??undefined);
   return row;
  },serial);
 }
 async replaceMedia(actor:string,entity:'product'|'variant'|'category',id:string,mediaIds:string[]){
  if(new Set(mediaIds).size!==mediaIds.length||mediaIds.length>12)
   throw new ConflictException('Galería inválida o excede doce imágenes');
  return this.db.$transaction(async tx=>{
   await permission(tx,actor,'catalog.manage',null);
   const exists=entity==='product'?await tx.producto.findUnique({where:{id}}):
    entity==='variant'?await tx.varianteProducto.findUnique({where:{id}}):
    await tx.categoria.findUnique({where:{id}});
   if(!exists)throw new NotFoundException('Recurso inexistente');
   for(const mediaId of mediaIds){
    const media=await tx.media.findUnique({where:{id:mediaId}});
    if(!media||media.tipo!=='IMAGEN'||!media.confirmadaEn||media.eliminadaEn||
       media.contexto!==(entity==='category'?'CATEGORIA':'PRODUCTO')||media.sucursalId!==null)
     throw new ConflictException('Fotografía no confirmada, no global o de contexto incorrecto');
   }
   let previous:string[]=[];
   if(entity==='product'){
    previous=(await tx.productoMedia.findMany({where:{productoId:id}})).map(x=>x.mediaId);
    await tx.productoMedia.deleteMany({where:{productoId:id}});
    if(mediaIds.length)await tx.productoMedia.createMany({data:mediaIds.map((mediaId,orden)=>({
     productoId:id,mediaId,orden,principal:orden===0}))});
   }else if(entity==='variant'){
    previous=(await tx.varianteProductoMedia.findMany({where:{varianteId:id}})).map(x=>x.mediaId);
    await tx.varianteProductoMedia.deleteMany({where:{varianteId:id}});
    if(mediaIds.length)await tx.varianteProductoMedia.createMany({data:mediaIds.map((mediaId,orden)=>({
     varianteId:id,mediaId,orden,principal:orden===0}))});
   }else{
    previous=(await tx.categoriaMedia.findMany({where:{categoriaId:id}})).map(x=>x.mediaId);
    await tx.categoriaMedia.deleteMany({where:{categoriaId:id}});
    if(mediaIds.length)await tx.categoriaMedia.createMany({data:mediaIds.map((mediaId,orden)=>({
     categoriaId:id,mediaId,orden,principal:orden===0}))});
   }
   await audit(tx,actor,'CATALOG_MEDIA_UPDATED',entity==='product'?'Producto':entity==='variant'?'VarianteProducto':'Categoria',
    id,null,{mediaIds:previous},{mediaIds});
   return {id,mediaIds,principalMediaId:mediaIds[0]??null};
  },serial);
 }
}
