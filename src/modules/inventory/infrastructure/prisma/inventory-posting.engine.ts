import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {amount,price,qty,requireStock,localDate} from '../../domain/stock.policy.js';
import {weightedAverageFromBook} from '../../domain/inventory-valuation.policy.js';
import {locationBookValue} from './inventory-ledger.js';
type Tx=Prisma.TransactionClient;
export type StockPosting={
 actorId:string;ubicacionId:string;articuloId:string;loteId?:string|null;
 cantidad:string;direction:'IN'|'OUT';tipo:'COMPRA'|'DEVOLUCION'|'CONSUMO_INTERNO'|'AJUSTE_ENTRADA'|'AJUSTE_SALIDA'|'MERMA'|'TRANSFERENCIA_SALIDA'|'TRANSFERENCIA_ENTRADA'|'PRODUCCION_SALIDA'|'PRODUCCION_ENTRADA'|'CONSUMO';
 costoUnitario?:string;costoTotalOverride?:string;claveOperacion:string;referenciaTipo:string;referenciaId:string;nota?:string;
 permission:'purchases.receipts.confirm'|'purchases.returns.manage'|'inventory.consume.internal'|'inventory.adjust'|'inventory.transfer'|'recipes.produce'|'kitchen.manage'|'orders.create'|'orders.manage';allowBlocked?:boolean;
};
export type CostSlice={cantidad:string;costoUnitario:string;costoTotal?:string};
@Injectable()
export class InventoryPostingEngine{
 constructor(private readonly db:PrismaService){}
 async allowed(tx:Tx,actorId:string,permission:string,branchId:string){
  const role=await tx.usuarioRol.findFirst({where:{usuarioId:actorId,usuario:{activo:true},OR:[
   {sucursalId:null,rol:{activo:true,alcance:'GLOBAL',rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}},
   {sucursalId:branchId,rol:{activo:true,alcance:'SUCURSAL',rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}}
  ]}});
  if(!role)throw new ForbiddenException('Permiso insuficiente para esta sucursal');
 }
 async warehouse(tx:Tx,id:string){
  const w=await tx.almacen.findUnique({where:{id},include:{sucursal:true}});
  if(!w)throw new NotFoundException('Almacén inexistente');
  if(!w.activo||!w.sucursal.activa)throw new ConflictException('Sucursal o almacén inactivo');
  return w;
 }
 async location(tx:Tx,id:string){
  const l=await tx.ubicacionAlmacen.findUnique({where:{id},include:{almacen:{include:{sucursal:true}}}});
  if(!l)throw new NotFoundException('Ubicación inexistente');
  if(!l.activa||!l.almacen.activo||!l.almacen.sucursal.activa)throw new ConflictException('Ubicación o sucursal inactiva');
  return l;
 }
 async stockPosition(tx:Tx,articuloId:string,ubicacionId:string,loteId:string|null){
  return tx.existencia.findFirst({where:{articuloId,ubicacionId,loteId}});
 }
 async post(tx:Tx,v:StockPosting){
  const count=amount(v.cantidad);
  if(v.costoTotalOverride!==undefined&&(v.direction!=='IN'||!['TRANSFERENCIA_ENTRADA','PRODUCCION_ENTRADA'].includes(v.tipo)))
   throw new BadRequestException('Solo una recepción de transferencia puede fijar costoTotal');
  const l=await this.location(tx,v.ubicacionId);
  await this.allowed(tx,v.actorId,v.permission,l.almacen.sucursalId);
  const art=await tx.articuloInventario.findUnique({where:{id:v.articuloId}});
  if(!art||!art.activo)throw new ConflictException('Artículo inexistente o inactivo');
  const batch=v.loteId??null;
  if(art.requiereLote&&!batch)throw new ConflictException('Este artículo requiere lote');
  if(!art.requiereLote&&batch)throw new ConflictException('El artículo no utiliza lotes');
  if(batch){
   const lot=await tx.loteInventario.findUnique({where:{id:batch}});
   if(!lot||lot.articuloId!==art.id)throw new ConflictException('Lote no pertenece al artículo');
   if(v.direction==='OUT'&&!v.allowBlocked&&(lot.bloqueado||
     (lot.fechaVencimiento&&lot.fechaVencimiento.toISOString().slice(0,10)<localDate(new Date(),l.almacen.sucursal.zonaHoraria))))
    throw new ConflictException('Lote bloqueado o vencido');
   if(art.requiereVencimiento&&!lot.fechaVencimiento)throw new ConflictException('Lote requiere vencimiento');
  }
  if(await tx.movimientoInventario.findUnique({where:{claveOperacion:v.claveOperacion}}))
   throw new ConflictException('Operación ya aplicada: '+v.claveOperacion);
  const company=await tx.empresaConfiguracion.findFirst();
  if(!company)throw new ConflictException('Configuración empresarial inexistente');
  const row=await this.stockPosition(tx,v.articuloId,v.ubicacionId,batch);
  const before=row?.cantidad??new Prisma.Decimal(0);
  let unit=new Prisma.Decimal(0),total=new Prisma.Decimal(0);
  let allocations:CostSlice[]=[];
  let consumed:Array<{id:string;cantidad:Prisma.Decimal;cost:Prisma.Decimal}>=[];
  if(v.direction==='IN'){
   if(v.costoUnitario===undefined)throw new BadRequestException('Entrada requiere costoUnitario explícito');
   unit=new Prisma.Decimal(v.costoUnitario);
   total=v.costoTotalOverride===undefined?
    count.mul(unit).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP):
    amount(v.costoTotalOverride,true);
   allocations=[{cantidad:qty(count),costoUnitario:price(unit),costoTotal:price(total)}];
   // Weighted average is per article+location, not per lot. A physical lot is
   // tracked separately but its accounting price is shared at this valuation scope.
   const siblings=await tx.existencia.findMany({where:{articuloId:art.id,ubicacionId:l.id},
    select:{cantidad:true}});
   const pooledQty=siblings.reduce((sum,x)=>sum.plus(x.cantidad),new Prisma.Decimal(0));
   const oldBook=await locationBookValue(tx,art.id,l.id);
   const avg=weightedAverageFromBook(pooledQty,oldBook,count,unit,total);
   if(row)await tx.existencia.update({where:{id:row.id},data:{cantidad:before.plus(count),costoPromedio:avg}});
   else await tx.existencia.create({data:{articuloId:art.id,ubicacionId:l.id,loteId:batch,cantidad:count,costoPromedio:avg}});
   await tx.existencia.updateMany({where:{articuloId:art.id,ubicacionId:l.id},
    data:{costoPromedio:avg}});
  }else{
   requireStock(before,count);
   if(!row)throw new ConflictException('Sin existencia');
   const layers=await tx.capaCostoInventario.findMany({where:{articuloId:art.id,ubicacionId:l.id,cantidadRestante:{gt:0}},
    orderBy:[{creadoEn:'asc'},{id:'asc'}]});
   let remaining=count;
   const used:Array<{id:string;cantidad:Prisma.Decimal;cost:Prisma.Decimal}>=[];
   for(const layer of layers){
    if(remaining.isZero())break;
    const take=Prisma.Decimal.min(remaining,layer.cantidadRestante);
    used.push({id:layer.id,cantidad:take,cost:layer.costoUnitario});
    remaining=remaining.minus(take);
   }
   if(!remaining.isZero())throw new ConflictException('Las capas de costo no concilian con el saldo; operación bloqueada');
   consumed=used;
   for(const a of used)await tx.capaCostoInventario.update({where:{id:a.id},data:{cantidadRestante:{decrement:a.cantidad}}});
   const fifo=used.reduce((sum,a)=>sum.plus(a.cantidad.mul(a.cost)),new Prisma.Decimal(0));
   if(company.metodoValoracion==='FIFO')total=fifo.toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
   else{
    const pool=await tx.existencia.aggregate({where:{articuloId:art.id,ubicacionId:l.id},
     _sum:{cantidad:true}});
    const poolQty=pool._sum.cantidad??new Prisma.Decimal(0);
    const book=await locationBookValue(tx,art.id,l.id);
    // Consume the entire remaining book balance when the last quantity leaves.
    total=poolQty.equals(count)?book:
     book.mul(count).div(poolQty).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
   }
   unit=total.div(count).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
   allocations=company.metodoValoracion==='FIFO'
    ?used.map(x=>({cantidad:qty(x.cantidad),costoUnitario:price(x.cost)}))
    :[{cantidad:qty(count),costoUnitario:price(unit),costoTotal:price(total)}];
   await tx.existencia.update({where:{id:row.id},data:{cantidad:before.minus(count)}});
  }
  if(total.greaterThan('99999999999999.999999'))
   throw new BadRequestException('Valor total excede la precisión monetaria permitida');
  const movement=await tx.movimientoInventario.create({data:{
   articuloId:art.id,ubicacionId:l.id,loteId:batch,tipo:v.tipo,
   cantidad:v.direction==='IN'?count:count.negated(),costoUnitario:unit,costoTotal:total,
   referenciaTipo:v.referenciaTipo,referenciaId:v.referenciaId,claveOperacion:v.claveOperacion,
   nota:v.nota,usuarioId:v.actorId
  }});
  if(v.direction==='IN'){
   await tx.capaCostoInventario.create({data:{movimientoEntradaId:movement.id,articuloId:art.id,
    ubicacionId:l.id,cantidadInicial:count,cantidadRestante:count,costoUnitario:unit}});
  }else{
   // Record precisely which cost layers funded this movement.
   for(const part of consumed){
    await tx.aplicacionCapaCosto.create({data:{
     capaId:part.id,movimientoSalidaId:movement.id,
     cantidad:part.cantidad,costoUnitario:part.cost
    }});
   }
  }
  await tx.eventoAuditoria.create({data:{usuarioId:v.actorId,sucursalId:l.almacen.sucursalId,
   accion:'STOCK_'+v.tipo,entidad:'MovimientoInventario',entidadId:movement.id,motivo:v.nota,
   despues:{claveOperacion:v.claveOperacion,articuloId:art.id,ubicacionId:l.id,
    loteId:batch,cantidad:v.direction==='IN'?qty(count):qty(count.negated()),
    costoUnitario:price(unit),costoTotal:price(total)}}});
  return {movementId:movement.id,claveOperacion:movement.claveOperacion,tipo:movement.tipo,
   articuloId:art.id,ubicacionId:l.id,loteId:batch,
   cantidad:qty(movement.cantidad),cantidadAnterior:qty(before),
   cantidadPosterior:qty(v.direction==='IN'?before.plus(count):before.minus(count)),
   costoUnitario:price(unit),costoTotal:price(total),allocations,
   sucursalId:l.almacen.sucursalId};
 }
 async tx<T>(callback:(tx:Tx)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<3;attempt++){
   try{
    return await this.db.$transaction(callback,{
     isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});
   }catch(err){
    if(err instanceof Prisma.PrismaClientKnownRequestError){
     // PostgreSQL 40001 serialization/write conflicts are safe to replay atomically.
     // 23505 conflicts during position creation can also be resolved by replaying.
     if((err.code==='P2034'||err.code==='P2002')&&attempt<2)continue;
     if(err.code==='P2034'||err.code==='P2002')
      throw new ConflictException('Operación concurrente: reintente con la misma clave');
    }
    throw err;
   }
  }
  throw new ConflictException('No se pudo confirmar por concurrencia');
 }
}
