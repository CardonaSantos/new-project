import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryRepositoryPort,type Scope,type Page,type Options,type ArticleInput,type ArticleUpdate,
 type ArticleFilter,type WarehouseFilter,type LocationFilter,type WarehouseInput,type LocationInput} from '../../application/ports/inventory.repository.port.js';
import {expirationRule,sameDimension,type Dimension,type ArticleKind} from '../../domain/inventory.policy.js';

type Tx=Prisma.TransactionClient;
const serial={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};
const articleInclude={unidadBase:true,medios:{include:{media:true},orderBy:[{principal:'desc' as const},{orden:'asc' as const}]}} as const;
const warehouseInclude={sucursal:{select:{id:true,codigo:true,nombre:true,activa:true}},
 _count:{select:{ubicacionAlmacenesComoAlmacen:true}}} as const;
const locationInclude={almacen:{include:{sucursal:{select:{id:true,codigo:true,nombre:true,activa:true}}}},
 _count:{select:{existenciasComoUbicacion:true,estacionPreparacionesComoUbicacionConsumo:true}}} as const;

async function perm(tx:Tx,userId:string,permission:string,sucursalId:string|null){
 const role=await tx.usuarioRol.findFirst({where:{
  usuarioId:userId,usuario:{activo:true},
  OR:[
   {sucursalId:null,rol:{alcance:'GLOBAL',activo:true,
    rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}},
   ...(sucursalId?[{sucursalId,rol:{alcance:'SUCURSAL' as const,activo:true,
    rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}}]:[])
  ]
 }});
 if(!role)throw new ForbiddenException('No tiene permisos para esta operación');
}
async function audit(tx:Tx,userId:string,action:string,entidad:string,entityId:string,
 sucursalId:string|null,before:unknown,after:unknown,motivo?:string){
 await tx.eventoAuditoria.create({data:{usuarioId:userId,accion:action,entidad,entidadId:entityId,sucursalId,
  antes:before==null?undefined:before as Prisma.InputJsonValue,
  despues:after==null?undefined:after as Prisma.InputJsonValue,
  motivo}});
}
function prismaConflict(error:unknown):never{
 if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
  throw new ConflictException('El código o la relación ya está registrado');
 throw error;
}
function scopeWarehouse(scope:Scope):Prisma.AlmacenWhereInput{
 return scope.global?{}:{sucursalId:{in:scope.branchIds}};
}
function scopeLocation(scope:Scope):Prisma.UbicacionAlmacenWhereInput{
 return scope.global?{}:{almacen:{sucursalId:{in:scope.branchIds}}};
}
function unitDto(u:{id:string;codigo:string;nombre:string;dimension:Dimension;esBase:boolean}){
 return {id:u.id,codigo:u.codigo,nombre:u.nombre,dimension:u.dimension,esBase:u.esBase};
}
type ArticleRow=Prisma.ArticuloInventarioGetPayload<{include:typeof articleInclude}>;
function articleDto(row:ArticleRow){
 return {id:row.id,codigo:row.codigo,nombre:row.nombre,tipo:row.tipo,activo:row.activo,
  unidadBase:unitDto(row.unidadBase),requiereLote:row.requiereLote,
  requiereVencimiento:row.requiereVencimiento,costoReferencia:row.costoReferencia?.toFixed(6)??null,
  stockMinimo:row.stockMinimo?.toFixed(6)??null,creadoEn:row.creadoEn,actualizadoEn:row.actualizadoEn,
  imagenes:row.medios.map(m=>({mediaId:m.mediaId,principal:m.principal,orden:m.orden,
   nombreOriginal:m.media.nombreOriginal,url:m.media.urlPublica,confirmada:!!m.media.confirmadaEn})),
  imagenPrincipalId:row.medios.find(x=>x.principal)?.mediaId??row.medios[0]?.mediaId??null};
}
function locationDto(row:Prisma.UbicacionAlmacenGetPayload<{include:typeof locationInclude}>){
 return {id:row.id,codigo:row.codigo,nombre:row.nombre,almacenId:row.almacenId,
  sucursalId:row.almacen.sucursalId,almacen:{id:row.almacen.id,nombre:row.almacen.nombre,
   codigo:row.almacen.codigo,activo:row.almacen.activo,sucursal:row.almacen.sucursal},
  activa:row.activa,esRecepcion:row.esRecepcion,
  dependencias:{posicionesExistencia:row._count.existenciasComoUbicacion,
   estacionesPreparacion:row._count.estacionPreparacionesComoUbicacionConsumo}};
}
function warehouseDto(row:Prisma.AlmacenGetPayload<{include:typeof warehouseInclude}>){
 return {id:row.id,codigo:row.codigo,nombre:row.nombre,sucursalId:row.sucursalId,
  sucursal:row.sucursal,activo:row.activo,creadoEn:row.creadoEn,
  ubicaciones:row._count.ubicacionAlmacenesComoAlmacen};
}
async function currentBranch(tx:Tx,branchId:string){
 const b=await tx.sucursal.findUnique({where:{id:branchId}});
 if(!b)throw new NotFoundException('Sucursal no encontrada');
 if(!b.activa)throw new ConflictException('Sucursal desactivada');
 return b;
}
async function warehouseActive(tx:Tx,id:string){
 const w=await tx.almacen.findUnique({where:{id},include:{sucursal:true}});
 if(!w)throw new NotFoundException('Almacén no encontrado');
 if(!w.activo||!w.sucursal.activa)throw new ConflictException('Almacén o sucursal inactiva');
 return w;
}
async function connectedDependencies(tx:Tx,id:string){
 const [variants,recipes,components,modifiers,substitutes,packaging,presentations]=await Promise.all([
  tx.varianteProducto.count({where:{articuloInventarioId:id,activo:true}}),
  tx.receta.count({where:{articuloResultadoId:id,activa:true}}),
  tx.recetaComponente.count({where:{articuloId:id,recetaVersion:{activa:true}}}),
  tx.modificadorComponente.count({where:{articuloId:id}}),
  tx.modificadorComponente.count({where:{sustituyeArticuloId:id}}),
  tx.reglaEmpaqueLinea.count({where:{articuloId:id}}),
  tx.presentacionCompra.count({where:{articuloId:id,activa:true}})
 ]);
 return {variantesActivas:variants,recetasActivas:recipes,componentesReceta:components,
  componentesModificador:modifiers,sustituciones:substitutes,reglasEmpaque:packaging,
  presentacionesCompraActivas:presentations};
}
async function directFactor(tx:Tx,a:string,b:string){
 const origin=await tx.unidadMedida.findUnique({where:{id:a}});
 const dest=await tx.unidadMedida.findUnique({where:{id:b}});
 if(!origin||!dest)throw new NotFoundException('Unidad inexistente');
 sameDimension(origin.dimension,dest.dimension);
 if(a===b)return {origin,dest,factor:new Prisma.Decimal(1)};
 const conversions=await tx.conversionUnidad.findMany({where:{
  unidadOrigen:{dimension:origin.dimension}},select:{unidadOrigenId:true,unidadDestinoId:true,factor:true}
 });
 const edges=new Map<string,{id:string;factor:Prisma.Decimal}[]>();
 const add=(src:string,id:string,factor:Prisma.Decimal)=>{
  edges.set(src,[...(edges.get(src)??[]),{id,factor}]);
 };
 for(const c of conversions){
  add(c.unidadOrigenId,c.unidadDestinoId,c.factor);
  add(c.unidadDestinoId,c.unidadOrigenId,new Prisma.Decimal(1).div(c.factor));
 }
 const visited=new Set<string>([a]);
 const queue:[string,Prisma.Decimal][]=[[a,new Prisma.Decimal(1)]];
 for(let i=0;i<queue.length;i++){
  const [id,factor]=queue[i];
  for(const edge of edges.get(id)??[]){
   if(visited.has(edge.id))continue;
   const candidate=factor.mul(edge.factor);
   if(edge.id===b)return {origin,dest,factor:candidate};
   visited.add(edge.id);queue.push([edge.id,candidate]);
  }
 }
 return {origin,dest,factor:null};
}
@Injectable()
export class PrismaInventoryRepository extends InventoryRepositoryPort{
 constructor(private readonly db:PrismaService){super();}
 async scope(userId:string,permission:string):Promise<Scope>{
  const roles=await this.db.usuarioRol.findMany({where:{usuarioId:userId,usuario:{activo:true},
   rol:{activo:true,rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}},include:{rol:true}});
  return {global:roles.some(x=>x.rol.alcance==='GLOBAL'&&x.sucursalId===null),
   branchIds:[...new Set(roles.filter(x=>x.rol.alcance==='SUCURSAL'&&x.sucursalId!==null).map(x=>x.sucursalId!))]};
 }
 async listUnits(f:Page){
  const where:Prisma.UnidadMedidaWhereInput=f.search?{OR:[
   {codigo:{contains:f.search,mode:'insensitive'}},{nombre:{contains:f.search,mode:'insensitive'}}
  ]}:{};
  const [data,total]=await this.db.$transaction([
   this.db.unidadMedida.findMany({where,orderBy:[{dimension:'asc'},{codigo:'asc'}],
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.unidadMedida.count({where})]);
  return {data:data.map(unitDto),total};
 }
 async unitOptions(f:Options&{dimension?:Dimension}){
  const where:Prisma.UnidadMedidaWhereInput={
   ...(f.dimension?{dimension:f.dimension}:{}),
   ...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{OR:[{codigo:{contains:f.search,mode:'insensitive'}},
    {nombre:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const rows=await this.db.unidadMedida.findMany({where,orderBy:{id:'asc'},take:f.limit+1});
  return {data:rows.slice(0,f.limit).map(unitDto),nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async getUnit(id:string){const u=await this.db.unidadMedida.findUnique({where:{id}});return u?unitDto(u):null;}
 async createUnit(userId:string,input:{codigo:string;nombre:string;dimension:Dimension;esBase:boolean}){
  try{return await this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.units.manage',null);
   if(input.esBase&&await tx.unidadMedida.count({where:{dimension:input.dimension,esBase:true}}))
    throw new ConflictException('La dimensión ya tiene unidad base');
   const u=await tx.unidadMedida.create({data:input});
   await audit(tx,userId,'UNIT_CREATED','UnidadMedida',u.id,null,null,input);
   return unitDto(u);
  },serial);}catch(e){prismaConflict(e);}
 }
 async updateUnit(userId:string,id:string,name:string){
  return this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.units.manage',null);
   const before=await tx.unidadMedida.findUnique({where:{id}});
   if(!before)throw new NotFoundException('Unidad no encontrada');
   const u=await tx.unidadMedida.update({where:{id},data:{nombre:name}});
   await audit(tx,userId,'UNIT_UPDATED','UnidadMedida',id,null,{nombre:before.nombre},{nombre:u.nombre});
   return unitDto(u);
  },serial);
 }
 async listConversions(f:Page&{dimension?:Dimension}){
  const where:Prisma.ConversionUnidadWhereInput={
   ...(f.dimension?{unidadOrigen:{dimension:f.dimension}}:{}),
   ...(f.search?{OR:[
    {unidadOrigen:{nombre:{contains:f.search,mode:'insensitive'}}},
    {unidadDestino:{nombre:{contains:f.search,mode:'insensitive'}}}
   ]}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.conversionUnidad.findMany({where,include:{unidadOrigen:true,unidadDestino:true},
    orderBy:{id:'asc'},skip:(f.page-1)*f.limit,take:f.limit}),
   this.db.conversionUnidad.count({where})]);
  return {data:rows.map(r=>({id:r.id,origen:unitDto(r.unidadOrigen),
   destino:unitDto(r.unidadDestino),factor:r.factor.toFixed(10)})),total};
 }
 async convert(originId:string,destId:string,amount:string){
  const result=await directFactor(this.db,originId,destId);
  if(!result.factor)throw new NotFoundException('No existe conversión entre estas unidades');
  const total=new Prisma.Decimal(amount).mul(result.factor);
  return {origen:unitDto(result.origin),destino:unitDto(result.dest),cantidadOrigen:amount,
   factor:result.factor.toFixed(10),cantidadDestino:total.toFixed(6)};
 }
 async createConversion(userId:string,input:{unidadOrigenId:string;unidadDestinoId:string;factor:string}){
  try{return await this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.units.manage',null);
   if(input.unidadOrigenId===input.unidadDestinoId)throw new ConflictException('Conversión a sí misma no se registra');
   const existing=await directFactor(tx,input.unidadOrigenId,input.unidadDestinoId);
   const newFactor=new Prisma.Decimal(input.factor);
   if(existing.factor){
    if(!existing.factor.sub(newFactor).abs().lessThan('0.0000000001'))
     throw new ConflictException('La conversión entra en conflicto con un factor existente');
    throw new ConflictException('Ya existe una ruta de conversión para estas unidades');
   }
   const row=await tx.conversionUnidad.create({data:{...input,factor:newFactor},
    include:{unidadOrigen:true,unidadDestino:true}});
   await audit(tx,userId,'UNIT_CONVERSION_CREATED','ConversionUnidad',row.id,null,null,
    {unidadOrigenId:input.unidadOrigenId,unidadDestinoId:input.unidadDestinoId,factor:input.factor});
   return {id:row.id,origen:unitDto(row.unidadOrigen),destino:unitDto(row.unidadDestino),
    factor:row.factor.toFixed(10)};
  },serial);}catch(e){prismaConflict(e);}
 }
 async listArticles(f:ArticleFilter){
  const where:Prisma.ArticuloInventarioWhereInput={
   ...(f.activo===undefined?{}:{activo:f.activo} ),
   ...(f.tipo?{tipo:f.tipo}:{}),
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.articuloInventario.findMany({where,include:articleInclude,
    orderBy:[{creadoEn:'desc'},{id:'desc'}],skip:(f.page-1)*f.limit,take:f.limit}),
   this.db.articuloInventario.count({where})]);
  return {data:rows.map(articleDto),total};
 }
 async articleOptions(f:Options&{tipo?:string}){
  const where:Prisma.ArticuloInventarioWhereInput={
   activo:true,...(f.tipo?{tipo:f.tipo as ArticleKind}:{}),
   ...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const rows=await this.db.articuloInventario.findMany({where,include:articleInclude,orderBy:{id:'asc'},take:f.limit+1});
  return {data:rows.slice(0,f.limit).map(r=>({...articleDto(r),label:r.nombre})),
   nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async getArticle(id:string){
  const row=await this.db.articuloInventario.findUnique({where:{id},include:articleInclude});
  return row?articleDto(row):null;
 }
 async createArticle(userId:string,input:ArticleInput){
  try{return await this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.articles.manage',null);
   if(!await tx.unidadMedida.findUnique({where:{id:input.unidadBaseId}}))
    throw new NotFoundException('Unidad base no encontrada');
   const row=await tx.articuloInventario.create({data:{
    ...input,costoReferencia:input.costoReferencia,stockMinimo:input.stockMinimo
   },include:articleInclude});
   await audit(tx,userId,'ARTICLE_CREATED','ArticuloInventario',row.id,null,null,
    {codigo:row.codigo,nombre:row.nombre,tipo:row.tipo});
   return articleDto(row);
  },serial);}catch(e){prismaConflict(e);}
 }
 async updateArticle(userId:string,id:string,input:ArticleUpdate){
  return this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.articles.manage',null);
   const before=await tx.articuloInventario.findUnique({where:{id}});
   if(!before)throw new NotFoundException('Artículo no encontrado');
   expirationRule(input.requiereLote??before.requiereLote,input.requiereVencimiento??before.requiereVencimiento);
   if((input.requiereLote===false||input.requiereVencimiento===false)&&
      await tx.movimientoInventario.count({where:{articuloId:id}}))
    throw new ConflictException('No puede reducir los controles de lote/vencimiento con historial de movimientos');
   const row=await tx.articuloInventario.update({where:{id},data:input,include:articleInclude});
   await audit(tx,userId,'ARTICLE_UPDATED','ArticuloInventario',id,null,
    {nombre:before.nombre,requiereLote:before.requiereLote,requiereVencimiento:before.requiereVencimiento,
     stockMinimo:before.stockMinimo?.toString()??null,costoReferencia:before.costoReferencia?.toString()??null},
    {nombre:row.nombre,requiereLote:row.requiereLote,requiereVencimiento:row.requiereVencimiento,
     stockMinimo:row.stockMinimo?.toString()??null,costoReferencia:row.costoReferencia?.toString()??null});
   return articleDto(row);
  },serial);
 }
 async articleStatus(userId:string,id:string,activo:boolean,motivo:string){
  return this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.articles.manage',null);
   const old=await tx.articuloInventario.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Artículo no encontrado');
   if(!activo){
    const uses=await connectedDependencies(tx,id);
    if(Object.values(uses).some(x=>x>0))
     throw new ConflictException('Artículo referenciado por recetas, variantes, empaques o compras activas');
    if(await tx.existencia.count({where:{articuloId:id,cantidad:{not:0}}}))
     throw new ConflictException('No puede desactivar un artículo con existencias pendientes');
   }
   if(old.activo===activo)return {id,activo};
   await tx.articuloInventario.update({where:{id},data:{activo}});
   await audit(tx,userId,activo?'ARTICLE_ACTIVATED':'ARTICLE_DEACTIVATED',
    'ArticuloInventario',id,null,{activo:old.activo},{activo},motivo);
   return {id,activo};
  },serial);
 }
 async dependencies(id:string){
  const result=await connectedDependencies(this.db,id);
  return {articuloId:id,...result};
 }
 async articleMedia(userId:string,id:string,mediaIds:string[]){
  return this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.articles.manage',null);
   if(!await tx.articuloInventario.findUnique({where:{id}}))throw new NotFoundException('Artículo no encontrado');
   if(mediaIds.length>10)throw new ConflictException('Máximo diez imágenes');
   const before=await tx.articuloInventarioMedia.findMany({where:{articuloId:id}});
   for(const mediaId of mediaIds){
    const item=await tx.media.findUnique({where:{id:mediaId}});
    if(!item||item.tipo!=='IMAGEN'||item.contexto!=='INVENTARIO'||!item.confirmadaEn||
       item.eliminadaEn||item.subidaPorId!==userId||item.sucursalId!==null)
      throw new ConflictException('Cada imagen debe estar confirmada, ser global y haber sido subida por el administrador');
   }
   await tx.articuloInventarioMedia.deleteMany({where:{articuloId:id}});
   if(mediaIds.length)await tx.articuloInventarioMedia.createMany({data:mediaIds.map((mediaId,orden)=>({
    articuloId:id,mediaId,orden,principal:orden===0
   }))});
   await audit(tx,userId,'ARTICLE_MEDIA_UPDATED','ArticuloInventario',id,null,
    {mediaIds:before.map(x=>x.mediaId)},{mediaIds});
   const row=await tx.articuloInventario.findUniqueOrThrow({where:{id},include:articleInclude});
   return articleDto(row);
  },serial);
 }
 async listWarehouses(f:WarehouseFilter,scope:Scope){
  const where:Prisma.AlmacenWhereInput={
   AND:[scopeWarehouse(scope),...(f.sucursalId?[{sucursalId:f.sucursalId}]:[])],
   ...(f.activo===undefined?{}:{activo:f.activo}),
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.almacen.findMany({where,include:warehouseInclude,
    orderBy:[{creadoEn:'desc'},{id:'desc'}],skip:(f.page-1)*f.limit,take:f.limit}),
   this.db.almacen.count({where})]);
  return {data:rows.map(warehouseDto),total};
 }
 async warehouseOptions(f:Options&{sucursalId?:string},scope:Scope){
  const where:Prisma.AlmacenWhereInput={
   AND:[scopeWarehouse(scope),...(f.sucursalId?[{sucursalId:f.sucursalId}]:[]),
    ...(f.cursor?[{id:{gt:f.cursor}}]:[])],activo:true,sucursal:{activa:true},
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const rows=await this.db.almacen.findMany({where,orderBy:{id:'asc'},take:f.limit+1});
  return {data:rows.slice(0,f.limit).map(r=>({id:r.id,label:r.nombre,codigo:r.codigo,sucursalId:r.sucursalId})),
   nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async getWarehouse(id:string){
  const row=await this.db.almacen.findUnique({where:{id},include:warehouseInclude});
  return row?warehouseDto(row):null;
 }
 async createWarehouse(userId:string,input:WarehouseInput){
  try{return await this.db.$transaction(async tx=>{
   await perm(tx,userId,'inventory.warehouses.manage',input.sucursalId);
   await currentBranch(tx,input.sucursalId);
   const row=await tx.almacen.create({data:input,include:warehouseInclude});
   await audit(tx,userId,'WAREHOUSE_CREATED','Almacen',row.id,input.sucursalId,null,
    {codigo:row.codigo,nombre:row.nombre});
   return warehouseDto(row);
  },serial);}catch(e){prismaConflict(e);}
 }
 async updateWarehouse(userId:string,id:string,input:{nombre:string}){
  return this.db.$transaction(async tx=>{
   const old=await tx.almacen.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Almacén no encontrado');
   await perm(tx,userId,'inventory.warehouses.manage',old.sucursalId);
   await currentBranch(tx,old.sucursalId);
   const row=await tx.almacen.update({where:{id},data:input,include:warehouseInclude});
   await audit(tx,userId,'WAREHOUSE_UPDATED','Almacen',id,old.sucursalId,{nombre:old.nombre},{nombre:row.nombre});
   return warehouseDto(row);
  },serial);
 }
 async warehouseStatus(userId:string,id:string,activo:boolean,motivo:string){
  return this.db.$transaction(async tx=>{
   const old=await tx.almacen.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Almacén no encontrado');
   await perm(tx,userId,'inventory.warehouses.manage',old.sucursalId);
   if(activo)await currentBranch(tx,old.sucursalId);
   if(!activo){
    const [stock,locations,openCounts,openAdjustments,openReceipts,transfers]=await Promise.all([
     tx.existencia.count({where:{ubicacion:{almacenId:id},cantidad:{not:0}}}),
     tx.ubicacionAlmacen.count({where:{almacenId:id,activa:true}}),
     tx.conteoInventario.count({where:{almacenId:id,estado:'BORRADOR'}}),
     tx.ajusteInventario.count({where:{almacenId:id,estado:'BORRADOR'}}),
     tx.recepcionCompra.count({where:{almacenId:id,estado:'BORRADOR'}}),
     tx.transferenciaInventario.count({where:{estado:{in:['BORRADOR','EN_TRANSITO']},
      OR:[{almacenOrigenId:id},{almacenDestinoId:id}]}})
    ]);
    if(stock+locations+openCounts+openAdjustments+openReceipts+transfers)
     throw new ConflictException('Almacén con stock, ubicaciones activas u operaciones pendientes');
   }
   if(old.activo===activo)return warehouseDto(await tx.almacen.findUniqueOrThrow({where:{id},include:warehouseInclude}));
   const row=await tx.almacen.update({where:{id},data:{activo},include:warehouseInclude});
   await audit(tx,userId,activo?'WAREHOUSE_ACTIVATED':'WAREHOUSE_DEACTIVATED',
    'Almacen',id,old.sucursalId,{activo:old.activo},{activo},motivo);
   return warehouseDto(row);
  },serial);
 }
 async listLocations(f:LocationFilter,scope:Scope){
  const where:Prisma.UbicacionAlmacenWhereInput={
   AND:[scopeLocation(scope),...(f.sucursalId?[{almacen:{sucursalId:f.sucursalId}}]:[]),
    ...(f.almacenId?[{almacenId:f.almacenId}]:[])],
   ...(f.activo===undefined?{}:{activa:f.activo}),
   ...(f.esRecepcion===undefined?{}:{esRecepcion:f.esRecepcion}),
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.ubicacionAlmacen.findMany({where,include:locationInclude,orderBy:[{almacenId:'asc'},{codigo:'asc'}],
    skip:(f.page-1)*f.limit,take:f.limit}),this.db.ubicacionAlmacen.count({where})]);
  return {data:rows.map(locationDto),total};
 }
 async locationOptions(f:Options&{almacenId?:string;sucursalId?:string},scope:Scope){
  const where:Prisma.UbicacionAlmacenWhereInput={
   AND:[scopeLocation(scope),...(f.sucursalId?[{almacen:{sucursalId:f.sucursalId}}]:[]),
    ...(f.almacenId?[{almacenId:f.almacenId}]:[]),...(f.cursor?[{id:{gt:f.cursor}}]:[])],
   activa:true,almacen:{activo:true,sucursal:{activa:true}},
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const rows=await this.db.ubicacionAlmacen.findMany({where,orderBy:{id:'asc'},take:f.limit+1,
   include:{almacen:{select:{sucursalId:true,nombre:true}}}});
  return {data:rows.slice(0,f.limit).map(r=>({id:r.id,label:r.nombre,codigo:r.codigo,
   almacenId:r.almacenId,almacenNombre:r.almacen.nombre,sucursalId:r.almacen.sucursalId,
   esRecepcion:r.esRecepcion})),nextCursor:rows.length>f.limit?rows[f.limit-1].id:null};
 }
 async getLocation(id:string){
  const row=await this.db.ubicacionAlmacen.findUnique({where:{id},include:locationInclude});
  return row?locationDto(row):null;
 }
 async createLocation(userId:string,input:LocationInput){
  try{return await this.db.$transaction(async tx=>{
   const w=await warehouseActive(tx,input.almacenId);
   await perm(tx,userId,'inventory.warehouses.manage',w.sucursalId);
   if(input.esRecepcion&&await tx.ubicacionAlmacen.count({where:{almacenId:w.id,activa:true,esRecepcion:true}}))
    throw new ConflictException('El almacén ya tiene una ubicación de recepción');
   const row=await tx.ubicacionAlmacen.create({data:input,include:locationInclude});
   await audit(tx,userId,'LOCATION_CREATED','UbicacionAlmacen',row.id,w.sucursalId,null,
    {codigo:row.codigo,nombre:row.nombre,esRecepcion:row.esRecepcion});
   return locationDto(row);
  },serial);}catch(e){prismaConflict(e);}
 }
 async updateLocation(userId:string,id:string,input:{nombre?:string;esRecepcion?:boolean}){
  return this.db.$transaction(async tx=>{
   const old=await tx.ubicacionAlmacen.findUnique({where:{id},include:{almacen:true}});
   if(!old)throw new NotFoundException('Ubicación no encontrada');
   await perm(tx,userId,'inventory.warehouses.manage',old.almacen.sucursalId);
   await warehouseActive(tx,old.almacenId);
   if(input.esRecepcion===true&&!old.esRecepcion&&await tx.ubicacionAlmacen.count({where:{
    almacenId:old.almacenId,activa:true,esRecepcion:true,id:{not:id}}}))
    throw new ConflictException('Existe otra ubicación de recepción');
   const row=await tx.ubicacionAlmacen.update({where:{id},data:input,include:locationInclude});
   await audit(tx,userId,'LOCATION_UPDATED','UbicacionAlmacen',id,old.almacen.sucursalId,
    {nombre:old.nombre,esRecepcion:old.esRecepcion},{nombre:row.nombre,esRecepcion:row.esRecepcion});
   return locationDto(row);
  },serial);
 }
 async locationStatus(userId:string,id:string,activo:boolean,motivo:string){
  return this.db.$transaction(async tx=>{
   const old=await tx.ubicacionAlmacen.findUnique({where:{id},include:{almacen:true}});
   if(!old)throw new NotFoundException('Ubicación no encontrada');
   await perm(tx,userId,'inventory.warehouses.manage',old.almacen.sucursalId);
   if(activo)await warehouseActive(tx,old.almacenId);
   if(!activo){
    const [stock,kitchen,pendingReceipts,transfers,production]=await Promise.all([
     tx.existencia.count({where:{ubicacionId:id,cantidad:{not:0}}}),
     tx.estacionPreparacion.count({where:{ubicacionConsumoId:id,activa:true}}),
     tx.recepcionCompraLinea.count({where:{ubicacionId:id,recepcion:{estado:'BORRADOR'}}}),
     tx.transferenciaInventarioLinea.count({where:{
      transferencia:{estado:{in:['BORRADOR','EN_TRANSITO']}},
      OR:[{ubicacionOrigenId:id},{ubicacionDestinoId:id}]}}),
     tx.produccionLote.count({where:{ubicacionDestinoId:id,estado:'BORRADOR'}})
    ]);
    if(stock+kitchen+pendingReceipts+transfers+production)
     throw new ConflictException('Ubicación con existencias o referencias operativas pendientes');
   }
   if(old.activa===activo)return locationDto(await tx.ubicacionAlmacen.findUniqueOrThrow({where:{id},include:locationInclude}));
   if(activo&&old.esRecepcion&&await tx.ubicacionAlmacen.count({where:{
    almacenId:old.almacenId,activa:true,esRecepcion:true,id:{not:id}}}))
    throw new ConflictException('Ya existe ubicación de recepción activa');
   const row=await tx.ubicacionAlmacen.update({where:{id},data:{activa:activo},include:locationInclude});
   await audit(tx,userId,activo?'LOCATION_ACTIVATED':'LOCATION_DEACTIVATED',
    'UbicacionAlmacen',id,old.almacen.sucursalId,{activa:old.activa},{activa:activo},motivo);
   return locationDto(row);
  },serial);
 }
 async overview(scope:Scope,sucursalId?:string){
  const wWhere:Prisma.AlmacenWhereInput={
   AND:[scopeWarehouse(scope),...(sucursalId?[{sucursalId}]:[])]
  };
  const lWhere:Prisma.UbicacionAlmacenWhereInput={
   AND:[scopeLocation(scope),...(sucursalId?[{almacen:{sucursalId}}]:[])]
  };
  const [articles,groups,active,units,conversions,warehouses,locations,
   reception,warehousesActive,locationsActive,articlesWithImage]=await Promise.all([
   this.db.articuloInventario.count(),
   this.db.articuloInventario.groupBy({by:['tipo'],_count:{_all:true}}),
   this.db.articuloInventario.count({where:{activo:true}}),
   this.db.unidadMedida.count(),
   this.db.conversionUnidad.count(),
   this.db.almacen.count({where:wWhere}),
   this.db.ubicacionAlmacen.count({where:lWhere}),
   this.db.ubicacionAlmacen.count({where:{AND:[lWhere,{esRecepcion:true,activa:true}]}}),
   this.db.almacen.count({where:{AND:[wWhere,{activo:true}]}}),
   this.db.ubicacionAlmacen.count({where:{AND:[lWhere,{activa:true}]}}),
   this.db.articuloInventario.count({where:{medios:{some:{}}}})
  ]);
  return {tipo:'MAESTROS_INVENTARIO',sucursalId:sucursalId??null,
   articulos:{alcance:'GLOBAL',total:articles,activos:active,inactivos:articles-active,
    porTipo:groups.map(g=>({tipo:g.tipo,total:g._count._all})),
    conFotografia:articlesWithImage},
   unidades:{total:units,conversiones:conversions},
   almacenes:{total:warehouses,activos:warehousesActive},
   ubicaciones:{total:locations,activas:locationsActive,recepcionActivas:reception},
   existencias:null,valorInventario:null,
   nota:'INV-A: existencias y valoración requieren el motor INV-B; no se calculan aún'};
 }
}
