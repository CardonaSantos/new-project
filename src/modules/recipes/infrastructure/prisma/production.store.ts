import {createHash,randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryPostingEngine} from '../../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {locationBookValue} from '../../../inventory/infrastructure/prisma/inventory-ledger.js';
import {localDate} from '../../../inventory/domain/stock.policy.js';
import {audit} from './recipe.store.js';
import {toBase} from './recipe-units.js';
import {quantity,money,demand,isDate,ensureUnique,validCode} from '../../domain/recipe.policy.js';
import type {PreviewDto,ExecuteProductionDto,ListProductionsDto,SourceDto} from '../../presentation/http/dto/recipe.dto.js';
type Tx=Prisma.TransactionClient;
const includeVersion={receta:true,recetaComponentesComoRecetaVersion:true} as const;
const details={recetaVersion:{include:{receta:true,recetaComponentesComoRecetaVersion:{include:{articulo:true}}}},
 ubicacionDestino:{include:{almacen:true}},loteResultado:true,
 produccionConsumosComoProduccion:{include:{articulo:true,ubicacion:true,lote:true,movimiento:true}}} as const;
type Version=Prisma.RecetaVersionGetPayload<{include:typeof includeVersion}>;
type Config={ubicacionConsumoId?:string;origenes?:SourceDto[]};
type PlanLine={articuloId:string;ubicacionId:string;loteId:string|null;cantidad:Prisma.Decimal};
@Injectable()
export class ProductionStore{
 constructor(private readonly db:PrismaService,private readonly identity:IdentityRepository,
  private readonly engine:InventoryPostingEngine){}
 private async permission(u:Principal,b:string,p:string){
  if(!(await this.identity.capabilities(u.id,b)).includes(p))
   throw new ForbiddenException('Permiso insuficiente para esta sucursal');
 }
 private async version(tx:Tx,id:string,production:boolean){
  const v=await tx.recetaVersion.findUnique({where:{id},include:includeVersion});
  if(!v||!v.publicadaEn||!v.activa||!v.receta.activa)
   throw new ConflictException('La versión debe estar publicada y activa');
  if(production&&v.receta.tipo!=='PRODUCCION')throw new ConflictException('Producción requiere receta tipo PRODUCCION');
  if(!v.recetaComponentesComoRecetaVersion.length)throw new ConflictException('Receta sin ingredientes');
  return v;
 }
 private async planned(tx:Tx,version:Version,quantityProduced:Prisma.Decimal,
  locationId:string,config:Config){
  const destination=await this.engine.location(tx,locationId);
  const branch=destination.almacen.sucursal;
  const outputId=version.receta.articuloResultadoId;
  const yieldInBase=version.receta.tipo==='PRODUCCION'?
   await toBase(tx,outputId!,version.unidadRendimientoId,version.rendimiento):
   version.rendimiento;
  const factor=quantityProduced.div(yieldInBase);
  if(factor.lte(0))throw new BadRequestException('Rendimiento inválido');
  const origins=config.origenes??[];
  ensureUnique(origins,x=>x.articuloId,'Origen de ingrediente');
  const ids=new Set(version.recetaComponentesComoRecetaVersion.map(x=>x.articuloId));
  for(const origin of origins)if(!ids.has(origin.articuloId))
   throw new BadRequestException('El origen contiene un ingrediente ajeno a la receta');
  const result:PlanLine[]=[];
  const short:Array<{articuloId:string;requerido:string;disponible:string}>=[];
  for(const component of version.recetaComponentesComoRecetaVersion){
   const net=demand(component,factor);
   const required=await toBase(tx,component.articuloId,component.unidadId,net);
   const custom=origins.find(x=>x.articuloId===component.articuloId);
   const chosenLocation=custom?.ubicacionId??config.ubicacionConsumoId??locationId;
   const location=await this.engine.location(tx,chosenLocation);
   if(location.almacen.sucursalId!==branch.id)
    throw new ConflictException('La ubicación de consumo no pertenece a la sucursal de producción');
   const positions=await tx.existencia.findMany({where:{articuloId:component.articuloId,
    ubicacionId:chosenLocation,cantidad:{gt:0}},include:{lote:true}});
   const today=localDate(new Date(),branch.zonaHoraria);
   const eligible=positions.filter(x=>
    (!custom?.loteId||x.loteId===custom.loteId)&&
    (!x.lote||!x.lote.bloqueado&&(!x.lote.fechaVencimiento||
     x.lote.fechaVencimiento.toISOString().slice(0,10)>=today)));
   eligible.sort((a,b)=>(a.lote?.fechaVencimiento?.toISOString()??'9999').localeCompare(
    b.lote?.fechaVencimiento?.toISOString()??'9999')||a.id.localeCompare(b.id));
   const available=eligible.reduce((a,x)=>a.plus(x.cantidad),new Prisma.Decimal(0));
   if(available.lessThan(required)){
    short.push({articuloId:component.articuloId,requerido:money(required),disponible:money(available)});
    continue;
   }
   let remaining=required;
   for(const pos of eligible){
    if(remaining.isZero())break;
    const take=Prisma.Decimal.min(remaining,pos.cantidad);
    result.push({articuloId:component.articuloId,ubicacionId:chosenLocation,
     loteId:pos.loteId,cantidad:take});
    remaining=remaining.minus(take);
   }
  }
  return {result,short,sucursalId:branch.id};
 }
 private async estimated(tx:Tx,lines:PlanLine[]){
  const company=await tx.empresaConfiguracion.findFirst();
  const costs:Prisma.Decimal[]=[];
  for(const l of lines){
   let total=new Prisma.Decimal(0);
   if(company?.metodoValoracion==='FIFO'){
    const layers=await tx.capaCostoInventario.findMany({where:{articuloId:l.articuloId,
     ubicacionId:l.ubicacionId,cantidadRestante:{gt:0}},orderBy:[{creadoEn:'asc'},{id:'asc'}]});
    let remaining=l.cantidad;
    for(const layer of layers){
     const taken=Prisma.Decimal.min(layer.cantidadRestante,remaining);
     total=total.plus(taken.mul(layer.costoUnitario));remaining=remaining.minus(taken);
     if(remaining.isZero())break;
    }
    if(!remaining.isZero())throw new ConflictException('Capas de costo insuficientes');
   }else{
    const pos=await tx.existencia.aggregate({where:{articuloId:l.articuloId,ubicacionId:l.ubicacionId},
     _sum:{cantidad:true}});
    const qty=pos._sum.cantidad??new Prisma.Decimal(0);
    const book=await locationBookValue(tx,l.articuloId,l.ubicacionId);
    total=qty.equals(l.cantidad)?book:
     book.mul(l.cantidad).div(qty).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
   }
   costs.push(total.toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP));
  }
  return costs;
 }
 async preview(u:Principal,id:string,d:PreviewDto){
  await this.permission(u,d.sucursalId,'recipes.read');
  await this.permission(u,d.sucursalId,'inventory.read');
  return this.engine.tx(async tx=>{
   const version=await this.version(tx,id,false);
   if(!d.ubicacionId)return {recetaVersionId:id,sucursalId:d.sucursalId,
    requiereUbicacion:true,ingredientes:version.recetaComponentesComoRecetaVersion.map(x=>({
     articuloId:x.articuloId,cantidad:money(x.cantidad),unidadId:x.unidadId,
     mermaPorcentaje:money(x.mermaPorcentaje)}))};
   const location=await this.engine.location(tx,d.ubicacionId);
   if(location.almacen.sucursalId!==d.sucursalId)throw new ForbiddenException('Ubicación ajena a sucursal');
   const amount=quantity(d.cantidad??money(version.rendimiento));
   const plan=await this.planned(tx,version,amount,d.ubicacionId,{ubicacionConsumoId:d.ubicacionId});
   const allowed=(await this.identity.capabilities(u.id,d.sucursalId)).includes('inventory.costs.read');
   const costs=allowed?await this.estimated(tx,plan.result):[];
   return {recetaVersionId:id,sucursalId:d.sucursalId,cantidad:money(amount),
    disponible:!plan.short.length,insuficientes:plan.short,
    consumos:plan.result.map((x,i)=>({...x,cantidad:money(x.cantidad),
     ...(allowed?{costoTotal:money(costs[i])}:{})})),
    ...(allowed?{costoEstimado:money(costs.reduce((sum,c)=>sum.plus(c),new Prisma.Decimal(0)))}:{})
   };
  });
 }
 private fingerprint(u:Principal,d:ExecuteProductionDto){
  return createHash('sha256').update(JSON.stringify({...d,claveOperacion:undefined,usuarioId:u.id})).digest('hex');
 }
 private async createTx(tx:Tx,u:Principal,d:ExecuteProductionDto){
  const qty=quantity(d.cantidadProducida);
  const v=await this.version(tx,d.recetaVersionId,true);
  const dest=await this.engine.location(tx,d.ubicacionDestinoId);
  await this.engine.allowed(tx,u.id,'recipes.produce',dest.almacen.sucursalId);
  if(d.ubicacionConsumoId){
   const loc=await this.engine.location(tx,d.ubicacionConsumoId);
   if(loc.almacen.sucursalId!==dest.almacen.sucursalId)throw new ConflictException('Consumo en otra sucursal');
  }
  const origins=d.origenes??[];
  ensureUnique(origins,x=>x.articuloId,'Origen');
  for(const origin of origins){
   const loc=await this.engine.location(tx,origin.ubicacionId);
   if(loc.almacen.sucursalId!==dest.almacen.sucursalId)
    throw new ConflictException('Origen en otra sucursal');
  }
  const expires=d.fechaVencimiento?isDate(d.fechaVencimiento):null;
  const article=await tx.articuloInventario.findUnique({where:{id:v.receta.articuloResultadoId!}});
  if(!article||!article.activo)throw new ConflictException('Artículo resultado inactivo');
  if(article.requiereVencimiento&&!expires&&v.vidaUtilDias===null)
   throw new BadRequestException('Indique fechaVencimiento o configure vidaUtilDias en la receta');
  const key=validCode(d.claveOperacion??'PROD:'+randomUUID());
  const hash=this.fingerprint(u,d);
  const existing=await tx.produccionLote.findUnique({where:{claveOperacion:key}});
  if(existing){
   if(existing.solicitudHash!==hash||existing.usuarioId!==u.id)
    throw new ConflictException('Clave de producción reutilizada con contenido diferente');
   return existing;
  }
  const row=await tx.produccionLote.create({data:{
   recetaVersionId:v.id,ubicacionDestinoId:d.ubicacionDestinoId,usuarioId:u.id,
   cantidadProducida:qty,fechaVencimiento:expires,claveOperacion:key,solicitudHash:hash,
   configuracion:{ubicacionConsumoId:d.ubicacionConsumoId??null,origenes} as Prisma.InputJsonValue
  }});
  await audit(tx,u,'PRODUCTION_DRAFT_CREATED','ProduccionLote',row.id,{recetaVersionId:v.id});
  return row;
 }
 private config(raw:Prisma.JsonValue|null):Config{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const r=raw as Record<string,unknown>;
  const origins=Array.isArray(r.origenes)?r.origenes as SourceDto[]:[];
  return {ubicacionConsumoId:typeof r.ubicacionConsumoId==='string'?r.ubicacionConsumoId:undefined,
   origenes:origins};
 }
 private async confirmTx(tx:Tx,u:Principal,id:string){
  const p=await tx.produccionLote.findUnique({where:{id},include:{
   recetaVersion:{include:includeVersion},ubicacionDestino:{include:{almacen:true}}}});
  if(!p)throw new NotFoundException('Producción inexistente');
  await this.engine.allowed(tx,u.id,'recipes.produce',p.ubicacionDestino.almacen.sucursalId);
  if(p.estado==='CONFIRMADA')return p;
  if(p.estado!=='BORRADOR')throw new ConflictException('Solo se confirma producción en borrador');
  const version=await this.version(tx,p.recetaVersionId,true);
  const outputId=version.receta.articuloResultadoId!;
  const plan=await this.planned(tx,version,p.cantidadProducida,p.ubicacionDestinoId,
   this.config(p.configuracion));
  if(plan.short.length)throw new ConflictException({message:'Ingredientes insuficientes o no utilizables',
   insuficientes:plan.short});
  let total=new Prisma.Decimal(0);
  for(let i=0;i<plan.result.length;i++){
   const line=plan.result[i];
   const move=await this.engine.post(tx,{actorId:u.id,articuloId:line.articuloId,
    ubicacionId:line.ubicacionId,loteId:line.loteId,cantidad:money(line.cantidad),
    direction:'OUT',tipo:'PRODUCCION_SALIDA',permission:'recipes.produce',
    claveOperacion:'PROD:'+p.id+':OUT:'+i,referenciaTipo:'PRODUCCION',
    referenciaId:p.id,nota:'Consumo producción '+p.id});
   total=total.plus(move.costoTotal);
   await tx.produccionConsumo.create({data:{
    produccionId:p.id,articuloId:line.articuloId,ubicacionId:line.ubicacionId,loteId:line.loteId,
    cantidad:line.cantidad,costoUnitario:new Prisma.Decimal(move.costoUnitario),
    movimientoId:move.movementId
   }});
  }
  const output=await tx.articuloInventario.findUniqueOrThrow({where:{id:outputId}});
  let batchId:string|null=null;
  let expiry=p.fechaVencimiento;
  if(output.requiereLote){
   if(!expiry&&version.vidaUtilDias!==null){
    const day=localDate(new Date(),p.ubicacionDestino.almacen.sucursal.zonaHoraria);
    const next=isDate(day);next.setUTCDate(next.getUTCDate()+version.vidaUtilDias);
    expiry=next;
   }
   if(output.requiereVencimiento&&!expiry)
    throw new ConflictException('Artículo resultado requiere fecha de vencimiento');
   const lot=await tx.loteInventario.create({data:{
    articuloId:outputId,codigoLote:'PROD-'+p.id,fechaVencimiento:expiry}});
   batchId=lot.id;
  }
  const result=await this.engine.post(tx,{actorId:u.id,articuloId:outputId,
   ubicacionId:p.ubicacionDestinoId,loteId:batchId,cantidad:money(p.cantidadProducida),
   direction:'IN',tipo:'PRODUCCION_ENTRADA',permission:'recipes.produce',
   costoUnitario:money(total.div(p.cantidadProducida).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP)),
   costoTotalOverride:money(total),claveOperacion:'PROD:'+p.id+':IN',
   referenciaTipo:'PRODUCCION',referenciaId:p.id,nota:'Resultado producción '+p.id});
  await tx.produccionLote.update({where:{id:p.id},data:{
   estado:'CONFIRMADA',confirmadoEn:new Date(),loteResultadoId:batchId,
   fechaVencimiento:expiry,costoTotal:total,movimientoResultadoId:result.movementId}});
  await audit(tx,u,'PRODUCTION_CONFIRMED','ProduccionLote',p.id,
   {consumos:plan.result.length,entradaMovimientoId:result.movementId,costoTotal:money(total)});
  return tx.produccionLote.findUniqueOrThrow({where:{id:p.id}});
 }
 private async view(u:Principal,id:string){
  const row=await this.db.produccionLote.findUnique({where:{id},include:details});
  if(!row)throw new NotFoundException('Producción inexistente');
  const branch=row.ubicacionDestino.almacen.sucursalId;
  await this.permission(u,branch,'recipes.production.read');
  const canCost=(await this.identity.capabilities(u.id,branch)).includes('inventory.costs.read');
  return {id:row.id,estado:row.estado,claveOperacion:row.claveOperacion,
   recetaVersion:row.recetaVersion,ubicacionDestino:row.ubicacionDestino,
   cantidadProducida:money(row.cantidadProducida),loteResultado:row.loteResultado,
   fechaVencimiento:row.fechaVencimiento?.toISOString().slice(0,10)??null,
   movimientoResultadoId:row.movimientoResultadoId,
   confirmadoEn:row.confirmadoEn,creadoEn:row.creadoEn,
   ...(canCost?{costoTotal:row.costoTotal?money(row.costoTotal):null}:{}),
   consumos:row.produccionConsumosComoProduccion.map(c=>({
    id:c.id,articulo:c.articulo,ubicacion:c.ubicacion,lote:c.lote,
    cantidad:money(c.cantidad),movimientoId:c.movimientoId,
    ...(canCost?{costoUnitario:money(c.costoUnitario),
     costoTotal:c.movimiento?money(c.movimiento.costoTotal):null}:{})
   }))};
 }
 async detail(u:Principal,id:string){return this.view(u,id);}
 async draft(u:Principal,d:ExecuteProductionDto){
  const loc=await this.db.ubicacionAlmacen.findUnique({where:{id:d.ubicacionDestinoId},include:{almacen:true}});
  if(!loc)throw new NotFoundException('Ubicación inexistente');
  await this.permission(u,loc.almacen.sucursalId,'recipes.produce');
  const p=await this.engine.tx(tx=>this.createTx(tx,u,d));
  return this.view(u,p.id);
 }
 async execute(u:Principal,d:ExecuteProductionDto){
  const loc=await this.db.ubicacionAlmacen.findUnique({where:{id:d.ubicacionDestinoId},include:{almacen:true}});
  if(!loc)throw new NotFoundException('Ubicación inexistente');
  await this.permission(u,loc.almacen.sucursalId,'recipes.produce');
  const p=await this.engine.tx(async tx=>{
   const created=await this.createTx(tx,u,d);
   return this.confirmTx(tx,u,created.id);
  });
  return this.view(u,p.id);
 }
 async confirm(u:Principal,id:string){
  const old=await this.db.produccionLote.findUnique({where:{id},include:{ubicacionDestino:{include:{almacen:true}}}});
  if(!old)throw new NotFoundException('Producción inexistente');
  await this.permission(u,old.ubicacionDestino.almacen.sucursalId,'recipes.produce');
  const p=await this.engine.tx(tx=>this.confirmTx(tx,u,id));
  return this.view(u,p.id);
 }
 async cancel(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const p=await tx.produccionLote.findUnique({where:{id},include:{ubicacionDestino:{include:{almacen:true}}}});
   if(!p)throw new NotFoundException('Producción inexistente');
   await this.engine.allowed(tx,u.id,'recipes.produce',p.ubicacionDestino.almacen.sucursalId);
   if(p.estado!=='BORRADOR')throw new ConflictException('Solo se cancelan borradores');
   await tx.produccionLote.update({where:{id},data:{estado:'CANCELADA'}});
   await audit(tx,u,'PRODUCTION_CANCELLED','ProduccionLote',id);
   return {id,estado:'CANCELADA'};
  });
 }
 async list(u:Principal,q:ListProductionsDto){
  await this.permission(u,q.sucursalId,'recipes.production.read');
  const where:Prisma.ProduccionLoteWhereInput={ubicacionDestino:{almacen:{sucursalId:q.sucursalId}}};
  const [rows,total]=await this.db.$transaction([
   this.db.produccionLote.findMany({where,include:{recetaVersion:{include:{receta:true}},
    ubicacionDestino:true,loteResultado:true},orderBy:{creadoEn:'desc'},
    skip:(q.page-1)*q.limit,take:q.limit}),this.db.produccionLote.count({where})]);
  const cost=(await this.identity.capabilities(u.id,q.sucursalId)).includes('inventory.costs.read');
  return {data:rows.map(r=>({id:r.id,estado:r.estado,receta:r.recetaVersion.receta.nombre,
   recetaVersion:r.recetaVersion.numero,ubicacion:r.ubicacionDestino.nombre,
   cantidadProducida:money(r.cantidadProducida),lote:r.loteResultado?.codigoLote??null,
   confirmadoEn:r.confirmadoEn,creadoEn:r.creadoEn,
   ...(cost?{costoTotal:r.costoTotal?money(r.costoTotal):null}:{})})),
   meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
 }
 async report(u:Principal,q:ListProductionsDto){
  await this.permission(u,q.sucursalId,'recipes.production.read');
  const rows=await this.db.produccionLote.findMany({where:{
   estado:'CONFIRMADA',ubicacionDestino:{almacen:{sucursalId:q.sucursalId}}},select:{
    cantidadProducida:true,costoTotal:true,recetaVersion:{select:{receta:{select:{nombre:true}}}}}});
  const canCost=(await this.identity.capabilities(u.id,q.sucursalId)).includes('inventory.costs.read');
  return {sucursalId:q.sucursalId,produccionesConfirmadas:rows.length,
   cantidadProducida:money(rows.reduce((s,r)=>s.plus(r.cantidadProducida),new Prisma.Decimal(0))),
   ...(canCost?{costoTotal:money(rows.reduce((s,r)=>s.plus(r.costoTotal??0),new Prisma.Decimal(0)))}:{})};
 }
}
