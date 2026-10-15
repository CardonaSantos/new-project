import {Injectable} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import type {CatalogScope} from '../../application/ports/catalog.repository.port.js';
@Injectable()
export class CatalogReportStore{
 constructor(private readonly db:PrismaService){}
 async summary(scope:CatalogScope,sucursalId?:string){
  const branches=await this.db.sucursal.findMany({where:{
   ...(sucursalId?{id:sucursalId}:{}),
   ...(scope.global?{}:{id:{in:scope.branchIds}})
  },select:{id:true,codigo:true,nombre:true,activa:true}});
  const ids=branches.map(b=>b.id);
  const [categories,products,variants,groups,modifiers,menus,byType,
   missingImages,visibleProducts]=await Promise.all([
   this.db.categoria.count({where:{activa:true}}),
   this.db.producto.count({where:{activo:true}}),
   this.db.varianteProducto.count({where:{activo:true,producto:{activo:true}}}),
   this.db.grupoModificador.count({where:{activo:true}}),
   this.db.modificador.count({where:{activo:true,grupo:{activo:true}}}),
   this.db.menu.count({where:{activo:true,publicadoEn:{not:null},
    sucursales:{some:{sucursalId:{in:ids},activa:true}}}}),
   this.db.producto.groupBy({by:['tipo'],_count:{_all:true},where:{activo:true}}),
   this.db.producto.count({where:{activo:true,medios:{none:{}}}}),
   this.db.producto.count({where:{activo:true,visibleEnMenu:true}})
  ]);
  const coverage=await Promise.all(branches.map(b=>this.coverage(scope,b.id,new Date())));
  return {alcance:'CONFIGURACION_COMERCIAL',fecha:new Date().toISOString(),
   categoriasActivas:categories,productosActivos:products,variantesActivas:variants,
   gruposActivos:groups,modificadoresActivos:modifiers,menusPublicados:menus,
   productosVisibles:visibleProducts,productosSinImagen:missingImages,
   productosPorTipo:byType.map(x=>({tipo:x.tipo,cantidad:x._count._all})),
   sucursales:coverage,ventas:null,rentabilidad:null,
   nota:'Ventas requieren Orders; rentabilidad requiere Recetas e Inventario operativo'};
 }
 async coverage(scope:CatalogScope,sucursalId:string,at:Date){
  if(!scope.global&&!scope.branchIds.includes(sucursalId))
   return {sucursalId,autorizada:false};
  const variants=await this.db.varianteProducto.findMany({where:{
   activo:true,producto:{activo:true,visibleEnMenu:true}
  },select:{id:true,productoId:true}});
  const ids=variants.map(x=>x.id);
  const [prices,overrides,branch,menus,photos]=await Promise.all([
   this.db.precioVariante.findMany({where:{sucursalId,varianteId:{in:ids},
    vigenteDesde:{lte:at},OR:[{vigenteHasta:null},{vigenteHasta:{gt:at}}]},
    select:{varianteId:true}}),
   this.db.varianteSucursal.findMany({where:{sucursalId,varianteId:{in:ids}},
    select:{varianteId:true,habilitada:true,pausadaHasta:true}}),
   this.db.sucursal.findUnique({where:{id:sucursalId},
    select:{codigo:true,nombre:true,activa:true}}),
   this.db.menu.count({where:{publicadoEn:{not:null},activo:true,
    sucursales:{some:{sucursalId,activa:true}}}}),
   this.db.producto.count({where:{id:{in:[...new Set(variants.map(x=>x.productoId))]},
    medios:{some:{media:{tipo:'IMAGEN',confirmadaEn:{not:null},eliminadaEn:null}}}}})
  ]);
  const enabled=new Map(overrides.map(x=>[x.varianteId,x]));
  const hasPrice=new Set(prices.map(x=>x.varianteId));
  const available=variants.filter(x=>{
   const o=enabled.get(x.id);
   return hasPrice.has(x.id)&&(o?.habilitada??true)&&(!o?.pausadaHasta||o.pausadaHasta<=at);
  });
  return {sucursalId,codigo:branch?.codigo,nombre:branch?.nombre,activa:branch?.activa??false,
   variantesVisibles:ids.length,conPrecio:prices.length,sinPrecio:ids.length-prices.length,
   vendiblesPorPrecioYEstado:available.length,menusPublicados:menus,
   productosConImagen:photos,fecha:at.toISOString(),
   nota:'Cobertura comercial; no valida stock, ingredientes o todas las fotos de variantes'};
 }
}
