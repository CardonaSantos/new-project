import {ConflictException,Injectable} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {ProductionStore} from '../../../recipes/infrastructure/prisma/production.store.js';
import {localDate} from '../../../inventory/domain/stock.policy.js';
import {sha} from '../../domain/order.policy.js';
import type {Tx} from './order-shared.js';

type Mode='MESA'|'MOSTRADOR'|'PARA_LLEVAR'|'DELIVERY';
type Take={articuloId:string;ubicacionId:string;loteId:string|null;cantidad:Prisma.Decimal};
@Injectable()
export class ConsumptionStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine,
  private readonly recipes:ProductionStore){}
 // Physical lot FEFO is deliberately independent from enterprise financial FIFO.
 async allocate(tx:Tx,articleId:string,branchId:string,amount:Prisma.Decimal){
  const branch=await tx.sucursal.findUnique({where:{id:branchId}});
  if(!branch)throw new ConflictException('Sucursal inexistente');
  const today=localDate(new Date(),branch.zonaHoraria);
  const positions=await tx.existencia.findMany({where:{
   articuloId:articleId,cantidad:{gt:0},ubicacion:{activa:true,almacen:{activo:true,sucursalId:branchId}}
  },include:{lote:true},orderBy:[{ubicacionId:'asc'},{id:'asc'}]});
  const eligible=positions.filter(x=>!x.lote||!x.lote.bloqueado&&
   (!x.lote.fechaVencimiento||x.lote.fechaVencimiento.toISOString().slice(0,10)>=today));
  eligible.sort((a,b)=>(a.lote?.fechaVencimiento?.toISOString()??'9999').localeCompare(
   b.lote?.fechaVencimiento?.toISOString()??'9999')||
   a.ubicacionId.localeCompare(b.ubicacionId)||a.id.localeCompare(b.id));
  let remaining=amount;
  const result:Take[]=[];
  for(const p of eligible){
   if(!remaining.gt(0))break;
   const take=Prisma.Decimal.min(p.cantidad,remaining);
   result.push({articuloId:articleId,ubicacionId:p.ubicacionId,loteId:p.loteId,cantidad:take});
   remaining=remaining.minus(take);
  }
  if(remaining.gt(0))throw new ConflictException('Stock utilizable insuficiente para artículo '+articleId);
  return result;
 }
 private async movementLines(tx:Tx,u:Principal,docId:string,lines:Take[],
  permission:'orders.create'|'orders.manage'|'kitchen.manage'){
  for(let i=0;i<lines.length;i++){
   const line=lines[i];
   const applied=await this.engine.post(tx,{
    actorId:u.id,articuloId:line.articuloId,ubicacionId:line.ubicacionId,loteId:line.loteId,
    cantidad:line.cantidad.toFixed(6),direction:'OUT',tipo:'CONSUMO',permission,
    claveOperacion:'ORD:CONS:'+docId+':'+i,referenciaTipo:'CONSUMO_ORDEN',
    referenciaId:docId,nota:'Consumo de orden'
   });
   await tx.consumoOrdenLinea.create({data:{
    consumoId:docId,articuloId:line.articuloId,ubicacionId:line.ubicacionId,
    loteId:line.loteId,cantidad:line.cantidad,
    costoUnitario:new Prisma.Decimal(applied.costoUnitario),movimientoId:applied.movementId
   }});
  }
 }
 async direct(tx:Tx,u:Principal,orderId:string,orderLineId:string,articleId:string,
  branch:string,amount:Prisma.Decimal,permission:'orders.create'|'orders.manage'){
  const clave='ORD:DIRECT:'+orderLineId;
  if(await tx.consumoOrden.findUnique({where:{claveOperacion:clave}}))return;
  const lines=await this.allocate(tx,articleId,branch,amount);
  const doc=await tx.consumoOrden.create({data:{
   ordenId:orderId,ordenLineaId:orderLineId,tipo:'DIRECTO',cantidadPreparada:amount,
   claveOperacion:clave,solicitudHash:sha({orderLineId,articleId,amount:amount.toFixed(3)})
  }});
  await this.movementLines(tx,u,doc.id,lines,permission);
 }
 async recipe(tx:Tx,u:Principal,orderId:string,orderLineId:string,ticketLineId:string,
  versionId:string,quantity:Prisma.Decimal,locationId:string,
  modifiers:string[],modality:Mode,previous:Prisma.Decimal){
  const clave='ORD:RECIPE:'+ticketLineId+':'+previous.toFixed(3);
  const planned=await this.recipes.planForOrder(tx,versionId,quantity,locationId,modifiers,modality);
  if(planned.short.length)throw new ConflictException({
   message:'Ingredientes insuficientes o no utilizables',insuficientes:planned.short
  });
  const doc=await tx.consumoOrden.create({data:{
   ordenId:orderId,ordenLineaId:orderLineId,comandaLineaId:ticketLineId,
   tipo:'RECETA',recetaVersionId:versionId,cantidadPreparada:quantity,
   claveOperacion:clave,solicitudHash:sha({versionId,quantity:quantity.toFixed(3),
    modifiers,modality,locationId})
  }});
  await this.movementLines(tx,u,doc.id,planned.result,'kitchen.manage');
  return doc;
 }
 async packaging(tx:Tx,u:Principal,orderId:string,branchId:string,modality:Mode){
  const clave='ORD:PACKAGE:'+orderId;
  if(await tx.consumoOrden.findUnique({where:{claveOperacion:clave}}))return;
  const rules=await tx.reglaEmpaque.findMany({where:{
   activa:true,alcance:'ORDEN',modalidad:modality,varianteId:null,
   OR:[{sucursalId:branchId},{sucursalId:null}]
  },include:{reglaEmpaqueLineasComoRegla:true}});
  rules.sort((a,b)=>Number(b.sucursalId!==null)-Number(a.sucursalId!==null)||a.id.localeCompare(b.id));
  if(!rules.length)return;
  const chosen=rules[0];
  const lines:Take[]=[];
  for(const part of chosen.reglaEmpaqueLineasComoRegla){
   const planned=await this.allocate(tx,part.articuloId,branchId,part.cantidad);
   lines.push(...planned);
  }
  const doc=await tx.consumoOrden.create({data:{
   ordenId:orderId,tipo:'EMPAQUE',claveOperacion:clave,
   solicitudHash:sha({ruleId:chosen.id,modality})
  }});
  await this.movementLines(tx,u,doc.id,lines,'kitchen.manage');
 }
}
