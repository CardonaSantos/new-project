import {createHash,randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../generated/prisma/client.js';
import {PrismaService} from '../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine,type CostSlice} from '../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {PurchaseOrdersStore} from '../purchases/infrastructure/prisma/purchase-orders.store.js';
import {amount,price,qty} from '../inventory/domain/stock.policy.js';
import type {Principal} from '../auth/application/auth.service.js';
import type {SupplyAvailabilityDto,SupplyCancelDto,SupplyQueryDto,SupplyReceiveDto,SupplyRequestDto,SupplySendDto,SupplyPurchaseDraftDto} from './supply.dto.js';

type Tx=Prisma.TransactionClient;
type D=Prisma.Decimal;
const zero=()=>new Prisma.Decimal(0);
const reqInclude={requisicionLineasComoRequisicion:{include:{articulo:{
 select:{id:true,codigo:true,nombre:true,stockMinimo:true,tipo:true}}}},
 transferenciaInventariosComoRequisicion:{include:{
  transferenciaInventarioLineasComoTransferencia:true}}} as const;
const transferInclude={almacenOrigen:true,almacenDestino:true,
 transferenciaInventarioLineasComoTransferencia:true} as const;

@Injectable()
export class SupplyStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine,
  private readonly purchases:PurchaseOrdersStore){}

 private async permission(tx:Tx,u:Principal,branchId:string,code:string){
  await this.engine.allowed(tx,u.id,code,branchId);
 }
 private async event(tx:Tx,u:Principal,branchId:string,action:string,entity:string,id:string,details:Record<string,unknown>={}){
  await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:branchId,
   accion:action,entidad:entity,entidadId:id,despues:details as Prisma.InputJsonValue}});
  await tx.eventoOutbox.create({data:{tipo:action,agregado:entity,agregadoId:id,
   payload:{sucursalId:branchId,...details} as Prisma.InputJsonValue}});
 }
 private async once<T extends Record<string,unknown>>(tx:Tx,u:Principal,key:string,
  name:string,payload:unknown,perform:()=>Promise<T>):Promise<T>{
  if(!/^[\w:.-]{6,120}$/.test(key))throw new BadRequestException('Clave de operación inválida');
  const digest=createHash('sha256').update(JSON.stringify({user:u.id,name,payload})).digest('hex');
  const prior=await tx.operacionIdempotente.findUnique({where:{clave:key}});
  if(prior){
   if(prior.operacion!==name||prior.hashSolicitud!==digest||!prior.finalizada||!prior.resultado)
    throw new ConflictException('Clave reutilizada con parámetros diferentes');
   return prior.resultado as T;
  }
  const result=await perform();
  await tx.operacionIdempotente.create({data:{clave:key,operacion:name,hashSolicitud:digest,
   resultado:result as Prisma.InputJsonValue,finalizada:true,
   expiraEn:new Date(Date.now()+365*86400000)}});
  return result;
 }
 private shape(row:any){
  const inTransit=new Map<string,D>();
  for(const transfer of row.transferenciaInventariosComoRequisicion){
   if(transfer.estado!=='EN_TRANSITO')continue;
   for(const l of transfer.transferenciaInventarioLineasComoTransferencia){
    inTransit.set(l.articuloId,(inTransit.get(l.articuloId)??zero()).plus(
     l.cantidadEnviada.minus(l.cantidadRecibida??0)));
   }
  }
  const lineas=row.requisicionLineasComoRequisicion.map((l:any)=>{
   const transit=inTransit.get(l.articuloId)??zero();
   return {id:l.id,articuloId:l.articuloId,articulo:l.articulo,
    solicitado:qty(l.cantidadSolicitada),recibido:qty(l.cantidadAtendida),
    enTransito:qty(transit),
    pendiente:qty(Prisma.Decimal.max(0,l.cantidadSolicitada.minus(l.cantidadAtendida).minus(transit)))};
  });
  const delivered=lineas.some((x:any)=>new Prisma.Decimal(x.recibido).gt(0));
  const pendingTransit=lineas.some((x:any)=>new Prisma.Decimal(x.enTransito).gt(0));
  const estadoVisible=row.estado==='ATENDIDA'?'ATENDIDA':row.estado==='CANCELADA'?'CANCELADA':
   delivered?'PARCIAL':pendingTransit?'EN_PROCESO':'SOLICITADA';
  return {id:row.id,numero:row.numero,almacenDestinoId:row.almacenDestinoId,
   solicitanteId:row.solicitanteId,estado:row.estado,estadoVisible,
   nota:row.nota,creadaEn:row.creadaEn,atendidaEn:row.atendidaEn,
   lineas,transferencias:row.transferenciaInventariosComoRequisicion.map((t:any)=>({
    id:t.id,numero:t.numero,estado:t.estado,almacenOrigenId:t.almacenOrigenId,
    despachadaEn:t.despachadaEn,recibidaEn:t.recibidaEn}))};
 }
 private async row(tx:Tx,id:string){
  const req=await tx.requisicion.findUnique({where:{id},include:reqInclude});
  if(!req)throw new NotFoundException('Requisición no encontrada');
  return req;
 }
 async list(u:Principal,q:SupplyQueryDto){
  return this.engine.tx(async tx=>{
   await this.permission(tx,u,q.sucursalId,'supply.read');
   const where={almacenDestino:{sucursalId:q.sucursalId}};
   const [rows,total]=await Promise.all([
    tx.requisicion.findMany({where,include:reqInclude,orderBy:{creadaEn:'desc'},
     skip:(q.page-1)*q.limit,take:q.limit}),tx.requisicion.count({where})]);
   return {data:rows.map(x=>this.shape(x)),meta:{
    page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
  });
 }
 async detail(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const req=await this.row(tx,id);
   const dest=await this.engine.warehouse(tx,req.almacenDestinoId);
   await this.permission(tx,u,dest.sucursalId,'supply.read');
   return this.shape(req);
  });
 }
 async create(u:Principal,d:SupplyRequestDto){
  return this.engine.tx(tx=>this.once(tx,u,d.claveOperacion,'SUP_REQUEST_CREATE',d,async()=>{
   const dest=await this.engine.warehouse(tx,d.almacenDestinoId);
   await this.permission(tx,u,dest.sucursalId,'supply.request');
   const ids=new Set<string>();
   const lines=[];
   for(const l of d.lineas){
    const n=amount(l.cantidadSolicitada);
    if(ids.has(l.articuloId))throw new ConflictException('Artículo repetido en la requisición');
    ids.add(l.articuloId);
    const article=await tx.articuloInventario.findUnique({where:{id:l.articuloId}});
    if(!article?.activo)throw new ConflictException('Artículo inexistente o inactivo');
    lines.push({articuloId:l.articuloId,cantidadSolicitada:n});
   }
   const req=await tx.requisicion.create({data:{
    numero:'REQ-'+randomUUID(),almacenDestinoId:dest.id,solicitanteId:u.id,
    nota:d.nota?.trim(),requisicionLineasComoRequisicion:{create:lines}}});
   await this.event(tx,u,dest.sucursalId,'SUP_REQUEST_CREATED','Requisicion',req.id,
    {almacenDestinoId:dest.id,lineas:lines.length});
   return {id:req.id,numero:req.numero,estado:'ABIERTA'};
  }));
 }
 async availability(u:Principal,id:string,q:SupplyAvailabilityDto){
  return this.engine.tx(async tx=>{
   const req=await this.row(tx,id);
   const dest=await this.engine.warehouse(tx,req.almacenDestinoId);
   await this.permission(tx,u,dest.sucursalId,'supply.read');
   const origin=await this.engine.warehouse(tx,q.almacenOrigenId);
   await this.permission(tx,u,origin.sucursalId,'supply.read');
   if(origin.id===dest.id)throw new ConflictException('Origen y destino son iguales');
   const positions=await tx.existencia.findMany({where:{ubicacion:{
    almacenId:origin.id,activa:true},articuloId:{in:req.requisicionLineasComoRequisicion.map(l=>l.articuloId)}},
    include:{lote:true}});
   const stock=new Map<string,D>();
   for(const p of positions){
    if(p.lote&&(p.lote.bloqueado||p.lote.fechaVencimiento&&p.lote.fechaVencimiento<new Date()))continue;
    stock.set(p.articuloId,(stock.get(p.articuloId)??zero()).plus(p.cantidad));
   }
   const lines=this.shape(req).lineas.map((l:any)=>{
    const remaining=new Prisma.Decimal(l.pendiente);
    const available=stock.get(l.articuloId)??zero();
    const sendable=Prisma.Decimal.min(remaining,available);
    return {...l,disponibleOrigen:qty(available),sugeridoEnviar:qty(sendable),
     faltante:qty(remaining.minus(sendable))};
   });
   return {requisicionId:id,almacenOrigenId:origin.id,almacenDestinoId:dest.id,
    lineas:lines,nota:'Sugerencia; no reserva existencias ni crea compras'};
  });
 }
 // This is a draft only: no payment or stock movement is performed here.
 // PUR-A validates supplier, purchasing conversion, permissions and the requisition link.
 async purchaseDraft(u:Principal,id:string,d:SupplyPurchaseDraftDto){
  await this.engine.tx(async tx=>{
   const req=await this.row(tx,id);
   if(req.estado!=='ABIERTA')throw new ConflictException('Requisición no abierta');
   const dest=await this.engine.warehouse(tx,req.almacenDestinoId);
   await this.permission(tx,u,dest.sucursalId,'supply.request');
   if(d.orden.sucursalId!==dest.sucursalId)
    throw new ConflictException('La compra pertenece a otra sucursal');
   const pending=new Map(this.shape(req).lineas.map((l:any)=>[l.articuloId,new Prisma.Decimal(l.pendiente)]));
   const expected=new Map<string,D>();
   for(const line of d.orden.lineas){
    if(!pending.has(line.articuloId))throw new ConflictException('Artículo ajeno a la requisición');
    const n=amount(line.cantidadCompra),factor=new Prisma.Decimal(line.factorAUnidadBase);
    expected.set(line.articuloId,(expected.get(line.articuloId)??zero()).plus(n.mul(factor)));
   }
   for(const [art,count] of expected)
    if(count.gt(pending.get(art)??zero()))
     throw new ConflictException('La compra excede el faltante de la requisición');
  });
  // The purchase idempotency key is persisted by PUR-A in its own transaction.
  return this.purchases.create(u,{...d.orden,requisicionId:id,claveOperacion:d.claveOperacion});
 }
 private async pending(tx:Tx,reqId:string,articleId:string){
  const transfers=await tx.transferenciaInventarioLinea.findMany({where:{
   articuloId:articleId,transferencia:{requisicionId:reqId,estado:'EN_TRANSITO'}},
   select:{cantidadEnviada:true,cantidadRecibida:true}});
  return transfers.reduce((s,t)=>s.plus(t.cantidadEnviada.minus(t.cantidadRecibida??0)),zero());
 }
 private async receiveSlices(tx:Tx,u:Principal,transferId:string,
  line:{id:string;articuloId:string;ubicacionDestinoId:string|null;loteId:string|null;
   cantidadEnviada:D;cantidadRecibida:D|null;capasEnTransito:Prisma.JsonValue|null},
  quantity:D,tag:string){
  if(!line.ubicacionDestinoId||!Array.isArray(line.capasEnTransito))
   throw new ConflictException('Envío sin destino o costos de tránsito');
  const slices=line.capasEnTransito as CostSlice[];
  let previous=line.cantidadRecibida??zero(),pending=quantity;
  const movementIds:string[]=[];
  for(let i=0;i<slices.length;i++){
   const slice=slices[i];const sliceQty=amount(slice.cantidad);
   const consumed=Prisma.Decimal.min(sliceQty,previous);
   previous=Prisma.Decimal.max(zero(),previous.minus(sliceQty));
   const taking=Prisma.Decimal.min(pending,sliceQty.minus(consumed));
   if(taking.lte(0))continue;
   const value=slice.costoTotal?new Prisma.Decimal(slice.costoTotal):sliceQty.mul(slice.costoUnitario);
   const cumulative=(v:D)=>value.mul(v).div(sliceQty).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP);
   const partialCost=cumulative(consumed.plus(taking)).minus(cumulative(consumed));
   const posted=await this.engine.post(tx,{actorId:u.id,articuloId:line.articuloId,
    ubicacionId:line.ubicacionDestinoId,loteId:line.loteId,cantidad:qty(taking),
    direction:'IN',tipo:'TRANSFERENCIA_ENTRADA',
    costoUnitario:price(new Prisma.Decimal(slice.costoUnitario)),
    costoTotalOverride:price(partialCost),
    claveOperacion:'SUP:TR:'+transferId+':IN:'+line.id+':'+tag+':'+i,
    referenciaTipo:'TRANSFERENCIA',referenciaId:transferId,
    nota:'Recepción de abastecimiento',permission:'supply.receive'});
   movementIds.push(posted.movementId);
   pending=pending.minus(taking);
  }
  if(!pending.isZero())throw new ConflictException('Capas de costo insuficientes para la recepción');
  return movementIds;
 }
 private async reconcile(tx:Tx,reqId:string,transferId:string){
  const lines=await tx.transferenciaInventarioLinea.findMany({where:{transferenciaId:transferId}});
  const complete=lines.every(l=>(l.cantidadRecibida??zero()).equals(l.cantidadEnviada));
  if(complete)await tx.transferenciaInventario.update({where:{id:transferId},
   data:{estado:'RECIBIDA',recibidaEn:new Date()}});
  const r=await tx.requisicion.findUniqueOrThrow({where:{id:reqId},include:{requisicionLineasComoRequisicion:true}});
  if(r.requisicionLineasComoRequisicion.every(l=>l.cantidadAtendida.gte(l.cantidadSolicitada))){
   await tx.requisicion.update({where:{id:reqId},data:{estado:'ATENDIDA',atendidaEn:new Date()}});
  }
  return complete;
 }
 async send(u:Principal,id:string,d:SupplySendDto){
  return this.engine.tx(tx=>this.once(tx,u,d.claveOperacion,'SUP_SEND',{id,...d},async()=>{
   const req=await this.row(tx,id);
   if(req.estado!=='ABIERTA')throw new ConflictException('Requisición no está abierta');
   const dest=await this.engine.warehouse(tx,req.almacenDestinoId);
   const origin=await this.engine.warehouse(tx,d.almacenOrigenId);
   if(origin.id===dest.id)throw new ConflictException('Origen y destino deben ser diferentes');
   await this.permission(tx,u,origin.sucursalId,'supply.send');
   if(d.inmediato)await this.permission(tx,u,dest.sucursalId,'supply.receive');
   const requested=new Map<string,D>();
   for(const l of req.requisicionLineasComoRequisicion){
    requested.set(l.articuloId,l.cantidadSolicitada.minus(l.cantidadAtendida).minus(
     await this.pending(tx,id,l.articuloId)));
   }
   const seen=new Set<string>();
   const totals=new Map<string,D>();
   const lines=[];
   for(const l of d.lineas){
    const key=[l.articuloId,l.ubicacionOrigenId,l.ubicacionDestinoId,l.loteId??''].join(':');
    if(seen.has(key))throw new ConflictException('Línea de envío duplicada');
    seen.add(key);
    const n=amount(l.cantidad);
    if(!requested.has(l.articuloId))throw new ConflictException('Artículo fuera de la requisición');
    const article=await tx.articuloInventario.findUnique({where:{id:l.articuloId}});
    if(!article?.activo)throw new ConflictException('Artículo inactivo');
    if(article.requiereLote!==Boolean(l.loteId))throw new ConflictException('Lote obligatorio o prohibido');
    if(l.loteId){
     const lot=await tx.loteInventario.findUnique({where:{id:l.loteId}});
     if(!lot||lot.articuloId!==l.articuloId)throw new ConflictException('Lote de artículo diferente');
    }
    const from=await this.engine.location(tx,l.ubicacionOrigenId);
    const to=await this.engine.location(tx,l.ubicacionDestinoId);
    if(from.almacenId!==origin.id||to.almacenId!==dest.id||from.id===to.id)
     throw new ConflictException('Ubicaciones fuera de origen/destino');
    totals.set(l.articuloId,(totals.get(l.articuloId)??zero()).plus(n));
    lines.push({articuloId:l.articuloId,ubicacionOrigenId:l.ubicacionOrigenId,
     ubicacionDestinoId:l.ubicacionDestinoId,loteId:l.loteId??null,cantidadEnviada:n});
   }
   for(const [art,n] of totals){
    if(n.gt(requested.get(art)??zero()))throw new ConflictException('El envío excede el pendiente de la requisición');
   }
   const transfer=await tx.transferenciaInventario.create({data:{
    numero:'TR-SUP-'+randomUUID(),almacenOrigenId:origin.id,almacenDestinoId:dest.id,
    requisicionId:id,usuarioId:u.id,estado:'EN_TRANSITO',nota:d.nota?.trim(),
    despachadaEn:new Date(),
    transferenciaInventarioLineasComoTransferencia:{create:lines}},
    include:transferInclude});
   const moves:string[]=[];
   for(const l of transfer.transferenciaInventarioLineasComoTransferencia){
    const result=await this.engine.post(tx,{actorId:u.id,articuloId:l.articuloId,
     ubicacionId:l.ubicacionOrigenId,loteId:l.loteId,cantidad:qty(l.cantidadEnviada),
     direction:'OUT',tipo:'TRANSFERENCIA_SALIDA',claveOperacion:'SUP:TR:'+transfer.id+':OUT:'+l.id,
     referenciaTipo:'TRANSFERENCIA',referenciaId:transfer.id,
     nota:d.nota?.trim(),permission:'supply.send'});
    moves.push(result.movementId);
    await tx.transferenciaInventarioLinea.update({where:{id:l.id},data:{
     costoEnTransito:new Prisma.Decimal(result.costoTotal),
     capasEnTransito:result.allocations as unknown as Prisma.InputJsonValue}});
    if(d.inmediato){
     moves.push(...await this.receiveSlices(tx,u,transfer.id,{
      ...l,capasEnTransito:result.allocations as unknown as Prisma.JsonValue,
      cantidadRecibida:zero()
     },l.cantidadEnviada,'IMMEDIATE'));
     await tx.transferenciaInventarioLinea.update({where:{id:l.id},
      data:{cantidadRecibida:l.cantidadEnviada}});
     const reqLine=req.requisicionLineasComoRequisicion.find(x=>x.articuloId===l.articuloId)!;
     await tx.requisicionLinea.update({where:{id:reqLine.id},
      data:{cantidadAtendida:{increment:l.cantidadEnviada}}});
    }
   }
   if(d.inmediato)await this.reconcile(tx,id,transfer.id);
   await this.event(tx,u,origin.sucursalId,d.inmediato?'SUP_IMMEDIATE_TRANSFER':'SUP_TRANSFER_SENT',
    'TransferenciaInventario',transfer.id,{requisicionId:id,lineas:lines.length,inmediato:!!d.inmediato});
   return {id:transfer.id,requisicionId:id,
    estado:d.inmediato?'RECIBIDA':'EN_TRANSITO',
    movimientoIds:moves};
  }));
 }
 async transfer(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const t=await tx.transferenciaInventario.findUnique({where:{id},include:transferInclude});
   if(!t?.requisicionId)throw new NotFoundException('Transferencia SUP-A no encontrada');
   await this.permission(tx,u,t.almacenDestino.sucursalId,'supply.read');
   return {id:t.id,numero:t.numero,estado:t.estado,requisicionId:t.requisicionId,
    almacenOrigenId:t.almacenOrigenId,almacenDestinoId:t.almacenDestinoId,
    despachadaEn:t.despachadaEn,recibidaEn:t.recibidaEn,nota:t.nota,
    lineas:t.transferenciaInventarioLineasComoTransferencia.map(l=>({
    id:l.id,articuloId:l.articuloId,ubicacionOrigenId:l.ubicacionOrigenId,
    ubicacionDestinoId:l.ubicacionDestinoId,loteId:l.loteId,
    enviada:qty(l.cantidadEnviada),recibida:qty(l.cantidadRecibida??zero()),
    pendiente:qty(l.cantidadEnviada.minus(l.cantidadRecibida??0))}))};
  });
 }
 async receive(u:Principal,id:string,d:SupplyReceiveDto){
  return this.engine.tx(tx=>this.once(tx,u,d.claveOperacion,'SUP_RECEIVE',{id,...d},async()=>{
   const t=await tx.transferenciaInventario.findUnique({where:{id},include:transferInclude});
   if(!t?.requisicionId)throw new NotFoundException('Transferencia SUP-A inexistente');
   if(t.estado!=='EN_TRANSITO')throw new ConflictException('La transferencia no está pendiente de recibir');
   await this.permission(tx,u,t.almacenDestino.sucursalId,'supply.receive');
   const req=await this.row(tx,t.requisicionId);
   if(req.estado!=='ABIERTA')throw new ConflictException('Requisición ya cerrada');
   const seen=new Set<string>();
   const changes=[];const movements:string[]=[];
   for(const l of d.lineas){
    if(seen.has(l.transferenciaLineaId))throw new ConflictException('Línea de recepción duplicada');
    seen.add(l.transferenciaLineaId);
    const line=t.transferenciaInventarioLineasComoTransferencia.find(x=>x.id===l.transferenciaLineaId);
    if(!line)throw new ConflictException('Línea ajena a la transferencia');
    const count=amount(l.cantidadRecibida);
    if(count.gt(line.cantidadEnviada.minus(line.cantidadRecibida??0)))
     throw new ConflictException('Se intenta recibir más de lo enviado');
    const tag=createHash('sha256').update(d.claveOperacion).digest('hex').slice(0,16);
    movements.push(...await this.receiveSlices(tx,u,t.id,line,count,tag));
    await tx.transferenciaInventarioLinea.update({where:{id:line.id},data:{
     cantidadRecibida:(line.cantidadRecibida??zero()).plus(count)}});
    const reqLine=req.requisicionLineasComoRequisicion.find(x=>x.articuloId===line.articuloId);
    if(!reqLine)throw new ConflictException('Artículo de transferencia ajeno a la requisición');
    await tx.requisicionLinea.update({where:{id:reqLine.id},data:{
     cantidadAtendida:{increment:count}}});
    changes.push({transferenciaLineaId:line.id,cantidadRecibida:qty(count)});
   }
   const complete=await this.reconcile(tx,t.requisicionId,t.id);
   await this.event(tx,u,t.almacenDestino.sucursalId,'SUP_TRANSFER_RECEIVED',
    'TransferenciaInventario',t.id,{requisicionId:t.requisicionId,
     recibido:changes,completa:complete,observaciones:d.observaciones?.trim()??null});
   return {id:t.id,requisicionId:t.requisicionId,estado:complete?'RECIBIDA':'EN_TRANSITO',
    lineasRecibidas:changes,movimientoIds:movements};
  }));
 }
 async cancel(u:Principal,id:string,d:SupplyCancelDto){
  return this.engine.tx(tx=>this.once(tx,u,d.claveOperacion,'SUP_REQUEST_CANCEL',{id,...d},async()=>{
   const req=await this.row(tx,id);
   const dest=await this.engine.warehouse(tx,req.almacenDestinoId);
   await this.permission(tx,u,dest.sucursalId,'supply.cancel');
   if(req.estado!=='ABIERTA')throw new ConflictException('Requisición no cancelable');
   const active=req.transferenciaInventariosComoRequisicion.some(t=>t.estado==='EN_TRANSITO');
   if(active)throw new ConflictException('Hay mercancía en tránsito; recíbala o concilie antes de cancelar');
   await tx.requisicion.update({where:{id},data:{estado:'CANCELADA',nota:[
    req.nota,'Cancelación: '+d.motivo.trim()].filter(Boolean).join(' | ')}});
   await this.event(tx,u,dest.sucursalId,'SUP_REQUEST_CANCELLED','Requisicion',id,
    {motivo:d.motivo.trim()});
   return {id,estado:'CANCELADA'};
  }));
 }
}
