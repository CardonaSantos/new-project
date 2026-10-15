import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {CatalogScope} from '../../application/ports/catalog.repository.port.js';
import {requireInventoryLink,type CatalogProductType} from '../../domain/catalog.policy.js';

export type Tx=Prisma.TransactionClient;
export const serial={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};
export const productInclude={
 categoria:true,medios:{include:{media:true},orderBy:{orden:'asc' as const}},
 varianteProductosComoProducto:{include:{
  medios:{include:{media:true},orderBy:{orden:'asc' as const}},
  articuloInventario:{select:{id:true,codigo:true,nombre:true,activo:true}},
  varianteGrupoModificadoresComoVariante:{include:{
   grupo:{include:{modificadoresComoGrupo:true}}
  },orderBy:{orden:'asc' as const}}
 },orderBy:{orden:'asc' as const}}
} as const;
export const variantInclude={
 producto:{select:{id:true,nombre:true,codigo:true,tipo:true,activo:true,visibleEnMenu:true}},
 articuloInventario:{select:{id:true,codigo:true,nombre:true,activo:true}},
 medios:{include:{media:true},orderBy:{orden:'asc' as const}},
 varianteGrupoModificadoresComoVariante:{include:{
  grupo:{include:{modificadoresComoGrupo:true}}
 },orderBy:{orden:'asc' as const}}
} as const;
export const categoryInclude={parent:{select:{id:true,nombre:true,parentId:true}},
 medios:{include:{media:true},orderBy:{orden:'asc' as const}},
 _count:{select:{productosComoCategoria:true,categoriasComoParent:true}}} as const;
export const groupInclude={modificadoresComoGrupo:{orderBy:{nombre:'asc' as const}},
 _count:{select:{varianteGrupoModificadoresComoGrupo:true}}} as const;
const typeofVariantMinimal={producto:{select:{id:true,nombre:true,codigo:true,activo:true,visibleEnMenu:true}},
 medios:{include:{media:true},orderBy:{orden:'asc' as const}}} as const;

export const menuInclude={
 sucursales:{include:{sucursal:{select:{id:true,codigo:true,nombre:true,activa:true}}}},
 horarios:{orderBy:{diaSemana:'asc' as const}},
 secciones:{orderBy:{orden:'asc' as const},include:{
  items:{orderBy:{orden:'asc' as const},
   include:{variante:{include:typeofVariantMinimal}}}
 }}
} as const;
export function failUnique(e:unknown):never{
 if(e instanceof Prisma.PrismaClientKnownRequestError){
  if(e.code==='P2002'||e.code==='P2004')throw new ConflictException('Registro duplicado o restricción comercial incumplida');
  if(e.code==='P2003')throw new ConflictException('Relación referenciada no válida');
 }
 const msg=e instanceof Error?e.message:'';
 if(/exclusion constraint|PrecioVariante_no_overlap|PrecioModificador_no_overlap/.test(msg))
  throw new ConflictException('Ya existe un precio con vigencia superpuesta');
 throw e;
}
export async function permission(tx:Tx,actorId:string,code:string,branchId:string|null){
 const found=await tx.usuarioRol.findFirst({where:{usuarioId:actorId,usuario:{activo:true},
  OR:[{sucursalId:null,rol:{alcance:'GLOBAL',activo:true,
   rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},
   ...(branchId?[{sucursalId:branchId,rol:{alcance:'SUCURSAL' as const,activo:true,
    rolPermisosComoRol:{some:{permiso:{codigo:code}}}}}]:[])]
 }});
 if(!found)throw new ForbiddenException('Permiso insuficiente');
}
export async function scope(db:PrismaService,userId:string,code:string):Promise<CatalogScope>{
 const rows=await db.usuarioRol.findMany({where:{usuarioId:userId,usuario:{activo:true},
  rol:{activo:true,rolPermisosComoRol:{some:{permiso:{codigo:code}}}}},include:{rol:true}});
 return {global:rows.some(x=>x.sucursalId===null&&x.rol.alcance==='GLOBAL'),
 branchIds:[...new Set(rows.filter(x=>x.sucursalId&&x.rol.alcance==='SUCURSAL').map(x=>x.sucursalId!))]};
}
export async function audit(tx:Tx,user:string,action:string,entity:string,id:string,
 branch:string|null,before:unknown,after:unknown,motivo?:string){
 await tx.eventoAuditoria.create({data:{usuarioId:user,accion:action,entidad:entity,entidadId:id,
  sucursalId:branch,motivo,antes:before===null?undefined:before as Prisma.InputJsonValue,
  despues:after===null?undefined:after as Prisma.InputJsonValue}});
}
export async function activeBranch(tx:Tx,id:string){
 const b=await tx.sucursal.findUnique({where:{id}});
 if(!b)throw new NotFoundException('Sucursal no encontrada');
 if(!b.activa)throw new ConflictException('Sucursal desactivada');
 return b;
}
export async function validateLink(tx:Tx,tipo:CatalogProductType,id?:string|null){
 requireInventoryLink(tipo,id);
 if(!id)return;
 const article=await tx.articuloInventario.findUnique({where:{id}});
 if(!article||!article.activo||article.tipo!=='PRODUCTO_TERMINADO')
  throw new ConflictException('La variante inventariable necesita un artículo activo PRODUCTO_TERMINADO');
}
export const nowPrice=(at:Date)=>({vigenteDesde:{lte:at},OR:[{vigenteHasta:null},{vigenteHasta:{gt:at}}]});
export async function variantPrice(tx:Tx,varianteId:string,sucursalId:string,at:Date){
 return tx.precioVariante.findFirst({where:{varianteId,sucursalId,...nowPrice(at)},
  orderBy:{vigenteDesde:'desc'}});
}
export async function modifierPrice(tx:Tx,modificadorId:string,sucursalId:string,at:Date){
 const custom=await tx.precioModificador.findFirst({where:{modificadorId,sucursalId,...nowPrice(at)},
  orderBy:{vigenteDesde:'desc'}});
 if(custom)return custom.importe;
 const mod=await tx.modificador.findUnique({where:{id:modificadorId}});
 if(!mod)throw new NotFoundException('Modificador inexistente');
 return mod.incrementoPrecio;
}
export function money(value:Prisma.Decimal|string|number){return new Prisma.Decimal(value).toFixed(2);}
