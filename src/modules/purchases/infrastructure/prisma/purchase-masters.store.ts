
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {dec} from '../../domain/purchase.policy.js';
import type {Actor} from './purchase-shared.js';
import {atomic,globalScope,audit,page,metadata,scope} from './purchase-shared.js';
import type {Paging,PresentationDto,SupplierDto,SupplierPatchDto,StatusDto} from '../../presentation/http/dto/purchases.dto.js';
@Injectable()
export class PurchaseMastersStore{
 constructor(private readonly db:PrismaService){}
 async suppliers(u:Actor,q:Paging){
  return atomic(this.db,async tx=>{
   if(q.sucursalId)await scope(tx,u,q.sucursalId,'purchases.read');
   else await globalScope(tx,u,'purchases.read');
   const where:Prisma.ProveedorWhereInput={...(q.search?{OR:[{nombre:{contains:q.search,mode:'insensitive'}},
    {nit:{contains:q.search,mode:'insensitive'}}]}:{})};
   const [data,total]=await Promise.all([tx.proveedor.findMany({where,...page(q),orderBy:{nombre:'asc'}}),
    tx.proveedor.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async supplier(u:Actor,id:string,branch?:string){
  return atomic(this.db,async tx=>{
   if(branch)await scope(tx,u,branch,'purchases.read');else await globalScope(tx,u,'purchases.read');
   const row=await tx.proveedor.findUnique({where:{id}});
   if(!row)throw new NotFoundException('Proveedor inexistente');
   return row;
  });
 }
 async createSupplier(u:Actor,d:SupplierDto){
  return atomic(this.db,async tx=>{
   await globalScope(tx,u,'purchases.suppliers.manage');
   const row=await tx.proveedor.create({data:{...d,nombre:d.nombre.trim(),nit:d.nit?.trim().toUpperCase()}});
   await audit(tx,u,null,'PUR_SUPPLIER_CREATED','Proveedor',row.id);
   return row;
  });
 }
 async updateSupplier(u:Actor,id:string,d:SupplierPatchDto){
  return atomic(this.db,async tx=>{
   await globalScope(tx,u,'purchases.suppliers.manage');
   if(!await tx.proveedor.findUnique({where:{id}}))throw new NotFoundException('Proveedor inexistente');
   const row=await tx.proveedor.update({where:{id},data:{...d,
    ...(d.nombre?{nombre:d.nombre.trim()}:{}),...(d.nit?{nit:d.nit.trim().toUpperCase()}:{})}});
   await audit(tx,u,null,'PUR_SUPPLIER_UPDATED','Proveedor',id);
   return row;
  });
 }
 async status(u:Actor,id:string,d:StatusDto){
  return atomic(this.db,async tx=>{
   await globalScope(tx,u,'purchases.suppliers.manage');
   if(!await tx.proveedor.findUnique({where:{id}}))throw new NotFoundException('Proveedor inexistente');
   if(!d.activo&&await tx.ordenCompra.count({where:{proveedorId:id,estado:{in:['BORRADOR','CONFIRMADA']}}}))
    throw new ConflictException('Proveedor tiene compras activas');
   const row=await tx.proveedor.update({where:{id},data:{activo:d.activo}});
   await audit(tx,u,null,'PUR_SUPPLIER_STATUS','Proveedor',id,{activo:d.activo});
   return row;
  });
 }
 async presentations(u:Actor,q:Paging){
  return atomic(this.db,async tx=>{
   if(q.sucursalId)await scope(tx,u,q.sucursalId,'purchases.read');else await globalScope(tx,u,'purchases.read');
   const where:Prisma.PresentacionCompraWhereInput={...(q.proveedorId?{proveedorId:q.proveedorId}:{})};
   const [data,total]=await Promise.all([tx.presentacionCompra.findMany({where,...page(q),
    include:{articulo:{include:{unidadBase:true}},unidadCompra:true,proveedor:true},orderBy:{nombre:'asc'}}),
    tx.presentacionCompra.count({where})]);
   return {data,meta:metadata(total,q)};
  });
 }
 async createPresentation(u:Actor,d:PresentationDto){
  return atomic(this.db,async tx=>{
   await globalScope(tx,u,'purchases.presentations.manage');
   const a=await tx.articuloInventario.findUnique({where:{id:d.articuloId},include:{unidadBase:true}});
   const unit=await tx.unidadMedida.findUnique({where:{id:d.unidadCompraId}});
   if(!a?.activo||!unit||a.unidadBase.dimension!==unit.dimension)
    throw new ConflictException('Artículo/unidad inválidos o dimensión incompatible');
   if(d.proveedorId&&!await tx.proveedor.findFirst({where:{id:d.proveedorId,activo:true}}))
    throw new ConflictException('Proveedor inactivo');
   const factor=dec(d.factorAUnidadBase,10);
   const row=await tx.presentacionCompra.create({data:{...d,factorAUnidadBase:factor,nombre:d.nombre.trim()}});
   await audit(tx,u,null,'PUR_PRESENTATION_CREATED','PresentacionCompra',row.id);
   return row;
  });
 }
 async presentationStatus(u:Actor,id:string,d:StatusDto){
  return atomic(this.db,async tx=>{
   await globalScope(tx,u,'purchases.presentations.manage');
   if(!await tx.presentacionCompra.findUnique({where:{id}}))
    throw new NotFoundException('Presentación no existe');
   const row=await tx.presentacionCompra.update({where:{id},data:{activa:d.activo}});
   await audit(tx,u,null,'PUR_PRESENTATION_STATUS','PresentacionCompra',id);
   return row;
  });
 }
}
