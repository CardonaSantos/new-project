import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {entryDetail,resolveEntry,type EntryInput,type ResolvedEntry} from '../../domain/entry-units.policy.js';

type Tx=Prisma.TransactionClient;

export interface EntryOption{
 tipo:'BASE'|'UNIDAD'|'PRESENTACION';
 /** Unit id for BASE/UNIDAD, presentation id for PRESENTACION. */
 id:string;
 nombre:string;
 codigo:string|null;
 /** Base units in one of these. */
 factor:string;
 proveedor:string|null;
}

/** Base units per unit, for every unit reachable from the base through conversions. */
async function unitFactors(tx:Tx,baseId:string,dimension:string){
 const edges=await tx.conversionUnidad.findMany({include:{unidadOrigen:true,unidadDestino:true}});
 const graph=new Map<string,Array<{id:string;factor:Prisma.Decimal}>>();
 const add=(a:string,b:string,f:Prisma.Decimal)=>graph.set(a,[...(graph.get(a)??[]),{id:b,factor:f}]);
 for(const e of edges){
  if(e.unidadOrigen.dimension!==dimension||e.unidadDestino.dimension!==dimension||!e.factor.greaterThan(0))continue;
  // factor: one origin = factor destination.
  add(e.unidadDestinoId,e.unidadOrigenId,e.factor);
  add(e.unidadOrigenId,e.unidadDestinoId,new Prisma.Decimal(1).div(e.factor));
 }
 // Walking from the base: «one X = f base» accumulates as we go.
 const result=new Map<string,Prisma.Decimal>([[baseId,new Prisma.Decimal(1)]]);
 const queue=[baseId];
 for(let i=0;i<queue.length;i++){
  const current=queue[i];
  for(const edge of graph.get(current)??[]){
   if(result.has(edge.id))continue;
   result.set(edge.id,result.get(current)!.mul(edge.factor));
   queue.push(edge.id);
  }
 }
 return result;
}

async function article(tx:Tx,articuloId:string){
 const row=await tx.articuloInventario.findUnique({where:{id:articuloId},include:{unidadBase:true}});
 if(!row)throw new NotFoundException('Artículo inexistente');
 return row;
}

/** What an entry for this article can be written in: its base unit, compatible units, presentations. */
export async function entryOptions(tx:Tx,articuloId:string):Promise<EntryOption[]>{
 const art=await article(tx,articuloId);
 const factors=await unitFactors(tx,art.unidadBaseId,art.unidadBase.dimension);
 const units=await tx.unidadMedida.findMany({where:{id:{in:[...factors.keys()]}},
  orderBy:{nombre:'asc'}});
 const presentations=await tx.presentacionCompra.findMany({where:{articuloId,activa:true},
  include:{proveedor:{select:{nombre:true}}},orderBy:{nombre:'asc'}});
 const base=units.find(u=>u.id===art.unidadBaseId)??art.unidadBase;
 return [
  {tipo:'BASE',id:base.id,nombre:base.nombre,codigo:base.codigo,factor:'1',proveedor:null},
  ...units.filter(u=>u.id!==art.unidadBaseId).map(u=>({tipo:'UNIDAD' as const,id:u.id,nombre:u.nombre,
   codigo:u.codigo,factor:factors.get(u.id)!.toDecimalPlaces(10).toString(),proveedor:null})),
  ...presentations.map(p=>({tipo:'PRESENTACION' as const,id:p.id,nombre:p.nombre,codigo:null,
   factor:p.factorAUnidadBase.toString(),proveedor:p.proveedor?.nombre??null})),
 ];
}

export interface EntryUnitChoice{unidadId?:string;presentacionId?:string}

/**
 * Turns an entry typed in a chosen unit or presentation into base quantity and cost.
 * With neither chosen it is the base unit, exactly as before.
 */
export async function convertEntry(tx:Tx,articuloId:string,input:EntryInput&EntryUnitChoice)
 :Promise<ResolvedEntry&{detalle:string|null}>{
 if(input.unidadId&&input.presentacionId)
  throw new BadRequestException('Elija una unidad o una presentación, no ambas');
 let factor:Prisma.Decimal|null=null,name:string|null=null;
 if(input.presentacionId){
  const p=await tx.presentacionCompra.findUnique({where:{id:input.presentacionId}});
  if(!p||p.articuloId!==articuloId)throw new ConflictException('La presentación no corresponde al artículo');
  if(!p.activa)throw new ConflictException('Presentación inactiva');
  factor=p.factorAUnidadBase;name=p.nombre;
 }else if(input.unidadId){
  const art=await article(tx,articuloId);
  if(input.unidadId!==art.unidadBaseId){
   const factors=await unitFactors(tx,art.unidadBaseId,art.unidadBase.dimension);
   const f=factors.get(input.unidadId);
   if(!f)throw new BadRequestException('La unidad no es compatible con la unidad del artículo');
   const unit=await tx.unidadMedida.findUnique({where:{id:input.unidadId}});
   factor=f;name=unit?.codigo??unit?.nombre??null;
  }
 }
 const resolved=resolveEntry(input,factor);
 return {...resolved,detalle:entryDetail(input,name)};
}
