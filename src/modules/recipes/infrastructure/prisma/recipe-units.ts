import {BadRequestException,ConflictException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {quantity} from '../../domain/recipe.policy.js';

export async function recipeConversion(tx:Prisma.TransactionClient,
 fromId:string,toId:string,quantityValue:Prisma.Decimal){
 if(fromId===toId)return quantityValue;
 const [from,to,edges]=await Promise.all([
  tx.unidadMedida.findUnique({where:{id:fromId}}),
  tx.unidadMedida.findUnique({where:{id:toId}}),
  tx.conversionUnidad.findMany({include:{unidadOrigen:true,unidadDestino:true}})
 ]);
 if(!from||!to||from.dimension!==to.dimension)
  throw new BadRequestException('Unidades inexistentes o dimensiones incompatibles');
 const graph=new Map<string,Array<{id:string,factor:Prisma.Decimal}>>();
 const add=(a:string,b:string,factor:Prisma.Decimal)=>{
  graph.set(a,[...(graph.get(a)??[]),{id:b,factor}]);
 };
 for(const edge of edges){
  if(edge.unidadOrigen.dimension!==from.dimension||edge.unidadDestino.dimension!==from.dimension)continue;
  if(edge.factor.lte(0))throw new ConflictException('Factor de conversión inválido');
  add(edge.unidadOrigenId,edge.unidadDestinoId,edge.factor);
  add(edge.unidadDestinoId,edge.unidadOrigenId,new Prisma.Decimal(1).div(edge.factor));
 }
 const queue=[{id:fromId,factor:new Prisma.Decimal(1)}],visited=new Set<string>([fromId]);
 for(let i=0;i<queue.length;i++){
  const current=queue[i];
  for(const edge of graph.get(current.id)??[]){
   if(visited.has(edge.id))continue;
   const factor=current.factor.mul(edge.factor);
   if(edge.id===toId)return quantityValue.mul(factor);
   visited.add(edge.id);queue.push({id:edge.id,factor});
  }
 }
 throw new ConflictException('No existe conversión entre las unidades de la receta y el artículo');
}
export async function toBase(tx:Prisma.TransactionClient,articleId:string,unitId:string,
 value:string|Prisma.Decimal){
 const article=await tx.articuloInventario.findUnique({where:{id:articleId},include:{unidadBase:true}});
 if(!article||!article.activo)throw new ConflictException('Ingrediente inactivo o inexistente');
 const source=await tx.unidadMedida.findUnique({where:{id:unitId}});
 if(!source||source.dimension!==article.unidadBase.dimension)
  throw new BadRequestException('La unidad de ingrediente no corresponde a su dimensión');
 const base=await recipeConversion(tx,unitId,article.unidadBaseId,
  value instanceof Prisma.Decimal?value:quantity(value));
 if(base.lte(0))throw new BadRequestException('Cantidad convertida inválida');
 const rounded=base.toDecimalPlaces(6,Prisma.Decimal.ROUND_CEIL);
 if(rounded.greaterThan('99999999999999.999999'))throw new BadRequestException('Cantidad convertida fuera de rango');
 return rounded;
}
