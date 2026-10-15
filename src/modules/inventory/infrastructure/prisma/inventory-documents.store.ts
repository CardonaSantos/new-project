import {randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {amount,cost,qty,price} from '../../domain/stock.policy.js';
import {InventoryPostingEngine,type CostSlice} from './inventory-posting.engine.js';
import type {CountCreateDto,TransferCreateDto} from '../../presentation/http/dto/inventory-operations.dto.js';
type Tx=Prisma.TransactionClient;
const included={almacen:true,conteoInventarioLineasComoConteo:{include:{
 articulo:{select:{codigo:true,nombre:true}},ubicacion:{select:{codigo:true,nombre:true}},
 lote:{select:{codigoLote:true}}}}} as const;
const transferInclude={almacenOrigen:{include:{sucursal:true}},almacenDestino:{include:{sucursal:true}},
 transferenciaInventarioLineasComoTransferencia:{include:{
  articulo:{select:{codigo:true,nombre:true}},lote:{select:{codigoLote:true}},
  ubicacionOrigen:{select:{codigo:true,nombre:true}},ubicacionDestino:{select:{codigo:true,nombre:true}}}}}} as const;
@Injectable()
export class InventoryDocumentsStore{
 constructor(private readonly db:PrismaService,private readonly identity:IdentityRepository,
  private readonly engine:InventoryPostingEngine){}
 private async read(u:Principal,branch:string,permission='inventory.read'){
  if(!(await this.identity.capabilities(u.id,branch)).includes(permission))
   throw new ForbiddenException('No tiene permiso en esta sucursal');
 }
 private async canReadCosts(u:Principal,branch:string){
  return (await this.identity.capabilities(u.id,branch)).includes('inventory.costs.read');
 }
 private async countDetail(row:any,u:Principal){
  const costAllowed=await this.canReadCosts(u,row.almacen.sucursalId);
  return {id:row.id,almacenId:row.almacenId,estado:row.estado,
   nota:row.nota,creadoEn:row.creadoEn,confirmadoEn:row.confirmadoEn,
   lineas:row.conteoInventarioLineasComoConteo.map((x:any)=>({
    id:x.id,articulo:x.articulo,ubicacion:x.ubicacion,lote:x.lote,
    cantidadTeorica:qty(x.cantidadTeorica),cantidadContada:qty(x.cantidadContada),
    delta:qty(x.cantidadContada.minus(x.cantidadTeorica)),
    ...(costAllowed?{costoUnitarioEntrada:x.costoUnitarioEntrada?.toFixed(6)??null}:{})
   }))};
 }
 async createCount(u:Principal,d:CountCreateDto){
  if(d.nota.trim().length<3)throw new BadRequestException('Nota obligatoria');
  const unique=new Set(d.lineas.map(x=>[x.articuloId,x.ubicacionId,x.loteId??''].join(':')));
  if(unique.size!==d.lineas.length)throw new ConflictException('Líneas de conteo repetidas');
  return this.engine.tx(async tx=>{
   const warehouse=await this.engine.warehouse(tx,d.almacenId);
   await this.engine.allowed(tx,u.id,'inventory.adjust',warehouse.sucursalId);
   const lines:Prisma.ConteoInventarioLineaCreateWithoutConteoInput[]=[];
   for(const line of d.lineas){
    const location=await this.engine.location(tx,line.ubicacionId);
    if(location.almacenId!==d.almacenId)throw new ConflictException('Ubicación ajena al almacén');
    const art=await tx.articuloInventario.findUnique({where:{id:line.articuloId}});
    if(!art||!art.activo)throw new ConflictException('Artículo inactivo');
    if(art.requiereLote!==!!line.loteId)throw new ConflictException('Control de lote no coincide');
    if(line.loteId){
     const lot=await tx.loteInventario.findUnique({where:{id:line.loteId}});
     if(!lot||lot.articuloId!==art.id)throw new ConflictException('Lote ajeno al artículo');
    }
    const counted=amount(line.cantidadContada,true);
    const pos=await this.engine.stockPosition(tx,line.articuloId,line.ubicacionId,line.loteId??null);
    const theoretical=pos?.cantidad??new Prisma.Decimal(0);
    if(counted.gt(theoretical)&&line.costoUnitarioEntrada===undefined)
     throw new BadRequestException('Ajuste positivo requiere costoUnitarioEntrada explícito');
    if(line.costoUnitarioEntrada!==undefined){
     cost(line.costoUnitarioEntrada);
     await this.engine.allowed(tx,u.id,'inventory.costs.manage',warehouse.sucursalId);
    }
    lines.push({articulo:{connect:{id:art.id}},ubicacion:{connect:{id:line.ubicacionId}},
     ...(line.loteId?{lote:{connect:{id:line.loteId}}}:{}),
     cantidadTeorica:theoretical,cantidadContada:counted,
     costoUnitarioEntrada:line.costoUnitarioEntrada===undefined?null:new Prisma.Decimal(line.costoUnitarioEntrada)});
   }
   const row=await tx.conteoInventario.create({data:{almacenId:d.almacenId,
    usuarioId:u.id,nota:d.nota,conteoInventarioLineasComoConteo:{create:lines}},include:included});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:warehouse.sucursalId,
    accion:'COUNT_CREATED',entidad:'ConteoInventario',entidadId:row.id,
    despues:{lineas:lines.length}}});
   return this.countDetail(row,u);
  });
 }
 async count(u:Principal,id:string){
  const row=await this.db.conteoInventario.findUnique({where:{id},include:included});
  if(!row)throw new NotFoundException('Conteo inexistente');
  await this.read(u,row.almacen.sucursalId);
  return this.countDetail(row,u);
 }
 async confirmCount(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const row=await tx.conteoInventario.findUnique({where:{id},include:included});
   if(!row)throw new NotFoundException('Conteo inexistente');
   await this.engine.allowed(tx,u.id,'inventory.adjust',row.almacen.sucursalId);
   if(row.estado!=='BORRADOR')throw new ConflictException('Conteo ya fue cerrado');
   for(const line of row.conteoInventarioLineasComoConteo){
    const current=await this.engine.stockPosition(tx,line.articuloId,line.ubicacionId,line.loteId);
    if(!(current?.cantidad??new Prisma.Decimal(0)).equals(line.cantidadTeorica))
     throw new ConflictException('Existencias cambiaron durante el conteo; inicie un reconteo');
   }
   const adjustment=await tx.ajusteInventario.create({data:{almacenId:row.almacenId,
    usuarioId:u.id,conteoId:id,motivo:'Diferencias de conteo '+id,estado:'BORRADOR'}});
   let affected=0;
   for(const line of row.conteoInventarioLineasComoConteo){
    const delta=line.cantidadContada.minus(line.cantidadTeorica);
    if(delta.isZero())continue;
    if(delta.gt(0)){
     await this.engine.allowed(tx,u.id,'inventory.costs.manage',row.almacen.sucursalId);
    }
    await tx.ajusteInventarioLinea.create({data:{ajusteId:adjustment.id,
     articuloId:line.articuloId,ubicacionId:line.ubicacionId,loteId:line.loteId,deltaCantidad:delta,
     motivo:'Conteo físico'}});
    await this.engine.post(tx,{actorId:u.id,articuloId:line.articuloId,
     ubicacionId:line.ubicacionId,loteId:line.loteId,cantidad:qty(delta.abs()),
     direction:delta.gt(0)?'IN':'OUT',tipo:delta.gt(0)?'AJUSTE_ENTRADA':'AJUSTE_SALIDA',
     costoUnitario:delta.gt(0)?line.costoUnitarioEntrada!.toFixed(6):undefined,
     claveOperacion:'COUNT:'+id+':'+line.id,referenciaTipo:'CONTEO',
     referenciaId:id,nota:'Diferencia de conteo',permission:'inventory.adjust',allowBlocked:true});
    affected++;
   }
   await tx.ajusteInventario.update({where:{id:adjustment.id},
    data:{estado:'CONFIRMADO',confirmadoEn:new Date()}});
   const changed=await tx.conteoInventario.update({where:{id},
    data:{estado:'CONFIRMADO',confirmadoEn:new Date()}});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:row.almacen.sucursalId,
    accion:'COUNT_CONFIRMED',entidad:'ConteoInventario',entidadId:id,
    despues:{ajusteId:adjustment.id,operaciones:affected}}});
   return {id,estado:changed.estado,ajusteId:adjustment.id,operaciones:affected};
  });
 }
 private async transferView(row:any,u:Principal){
  const [originCost,destCost]=await Promise.all([
   this.canReadCosts(u,row.almacenOrigen.sucursalId),this.canReadCosts(u,row.almacenDestino.sucursalId)]);
  return {id:row.id,numero:row.numero,estado:row.estado,nota:row.nota,
   origen:{id:row.almacenOrigen.id,nombre:row.almacenOrigen.nombre,sucursal:row.almacenOrigen.sucursal.nombre},
   destino:{id:row.almacenDestino.id,nombre:row.almacenDestino.nombre,sucursal:row.almacenDestino.sucursal.nombre},
   despachadaEn:row.despachadaEn,recibidaEn:row.recibidaEn,
   lineas:row.transferenciaInventarioLineasComoTransferencia.map((x:any)=>({
    id:x.id,articulo:x.articulo,lote:x.lote,ubicacionOrigen:x.ubicacionOrigen,
    ubicacionDestino:x.ubicacionDestino,cantidadEnviada:qty(x.cantidadEnviada),
    cantidadRecibida:x.cantidadRecibida?qty(x.cantidadRecibida):null,
    ...(originCost&&destCost?{costoEnTransito:x.costoEnTransito?.toFixed(6)??null,
     capasEnTransito:x.capasEnTransito}:{}),
   }))};
 }
 async createTransfer(u:Principal,d:TransferCreateDto){
  if(d.nota.trim().length<3)throw new BadRequestException('Nota obligatoria');
  const uniq=new Set(d.lineas.map(x=>[x.articuloId,x.ubicacionOrigenId,x.ubicacionDestinoId,x.loteId??''].join(':')));
  if(uniq.size!==d.lineas.length)throw new ConflictException('Línea de transferencia duplicada');
  return this.engine.tx(async tx=>{
   const origin=await this.engine.warehouse(tx,d.almacenOrigenId);
   const dest=await this.engine.warehouse(tx,d.almacenDestinoId);
   await this.engine.allowed(tx,u.id,'inventory.transfer',origin.sucursalId);
   await this.engine.allowed(tx,u.id,'inventory.transfer',dest.sucursalId);
   const lineas:Prisma.TransferenciaInventarioLineaCreateWithoutTransferenciaInput[]=[];
   for(const line of d.lineas){
    const a=await tx.articuloInventario.findUnique({where:{id:line.articuloId}});
    if(!a||!a.activo)throw new ConflictException('Artículo inválido');
    amount(line.cantidad);
    if(a.requiereLote!==!!line.loteId)throw new ConflictException('Lote obligatorio/no permitido');
    if(line.loteId){
     const lot=await tx.loteInventario.findUnique({where:{id:line.loteId}});
     if(!lot||lot.articuloId!==a.id)throw new ConflictException('Lote ajeno al artículo');
    }
    const from=await this.engine.location(tx,line.ubicacionOrigenId),
     to=await this.engine.location(tx,line.ubicacionDestinoId);
    if(from.almacenId!==origin.id||to.almacenId!==dest.id||from.id===to.id)
     throw new ConflictException('Ubicaciones no corresponden a almacenes o son iguales');
    lineas.push({articulo:{connect:{id:a.id}},
     ubicacionOrigen:{connect:{id:from.id}},ubicacionDestino:{connect:{id:to.id}},
     ...(line.loteId?{lote:{connect:{id:line.loteId}}}:{}),cantidadEnviada:new Prisma.Decimal(line.cantidad)});
   }
   const created=await tx.transferenciaInventario.create({data:{
    numero:'TR-'+randomUUID(),almacenOrigenId:origin.id,almacenDestinoId:dest.id,
    usuarioId:u.id,nota:d.nota,transferenciaInventarioLineasComoTransferencia:{create:lineas}},
    include:transferInclude});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:origin.sucursalId,
    accion:'TRANSFER_CREATED',entidad:'TransferenciaInventario',entidadId:created.id,
    despues:{origen:origin.id,destino:dest.id,lineas:lineas.length}}});
   return this.transferView(created,u);
  });
 }
 async transfer(u:Principal,id:string){
  const row=await this.db.transferenciaInventario.findUnique({where:{id},include:transferInclude});
  if(!row)throw new NotFoundException('Transferencia inexistente');
  await this.read(u,row.almacenOrigen.sucursalId);
  await this.read(u,row.almacenDestino.sucursalId);
  return this.transferView(row,u);
 }
 async dispatch(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const row=await tx.transferenciaInventario.findUnique({where:{id},include:transferInclude});
   if(!row)throw new NotFoundException('Transferencia inexistente');
   if(row.estado!=='BORRADOR')throw new ConflictException('Solo se despachan borradores');
   await this.engine.allowed(tx,u.id,'inventory.transfer',row.almacenOrigen.sucursalId);
   await this.engine.allowed(tx,u.id,'inventory.transfer',row.almacenDestino.sucursalId);
   for(const line of row.transferenciaInventarioLineasComoTransferencia){
    const r=await this.engine.post(tx,{actorId:u.id,articuloId:line.articuloId,
     ubicacionId:line.ubicacionOrigenId,loteId:line.loteId,cantidad:qty(line.cantidadEnviada),
     direction:'OUT',tipo:'TRANSFERENCIA_SALIDA',claveOperacion:'TR:'+id+':OUT:'+line.id,
     referenciaTipo:'TRANSFERENCIA',referenciaId:id,nota:row.nota??undefined,permission:'inventory.transfer'});
    await tx.transferenciaInventarioLinea.update({where:{id:line.id},
     data:{costoEnTransito:new Prisma.Decimal(r.costoTotal),
      capasEnTransito:r.allocations as unknown as Prisma.InputJsonValue}});
   }
   const changed=await tx.transferenciaInventario.update({where:{id},
    data:{estado:'EN_TRANSITO',despachadaEn:new Date()},include:transferInclude});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:row.almacenOrigen.sucursalId,
    accion:'TRANSFER_DISPATCHED',entidad:'TransferenciaInventario',entidadId:id,
    despues:{estado:'EN_TRANSITO',lineas:row.transferenciaInventarioLineasComoTransferencia.length}}});
   return this.transferView(changed,u);
  });
 }
 async receive(u:Principal,id:string){
  return this.engine.tx(async tx=>{
   const row=await tx.transferenciaInventario.findUnique({where:{id},include:transferInclude});
   if(!row)throw new NotFoundException('Transferencia inexistente');
   if(row.estado!=='EN_TRANSITO')throw new ConflictException('Transferencia no está en tránsito');
   await this.engine.allowed(tx,u.id,'inventory.transfer',row.almacenDestino.sucursalId);
   for(const line of row.transferenciaInventarioLineasComoTransferencia){
    if(!line.ubicacionDestinoId||!Array.isArray(line.capasEnTransito))
     throw new ConflictException('Transferencia sin destino o sin valoración en tránsito');
    const slices=line.capasEnTransito as CostSlice[];
    if(!slices.length)throw new ConflictException('Transferencia sin capas de costo');
    const total=slices.reduce((sum,s)=>sum.plus(amount(s.cantidad)),new Prisma.Decimal(0));
    if(!total.equals(line.cantidadEnviada))throw new ConflictException('Costo en tránsito no concilia con envío');
    for(let i=0;i<slices.length;i++){
     const slice=slices[i];cost(slice.costoUnitario);
     await this.engine.post(tx,{actorId:u.id,articuloId:line.articuloId,
      ubicacionId:line.ubicacionDestinoId,loteId:line.loteId,cantidad:slice.cantidad,
      direction:'IN',tipo:'TRANSFERENCIA_ENTRADA',costoUnitario:slice.costoUnitario,
      claveOperacion:'TR:'+id+':IN:'+line.id+':'+i,
      referenciaTipo:'TRANSFERENCIA',referenciaId:id,nota:row.nota??undefined,permission:'inventory.transfer'});
    }
    await tx.transferenciaInventarioLinea.update({where:{id:line.id},
     data:{cantidadRecibida:line.cantidadEnviada}});
   }
   const changed=await tx.transferenciaInventario.update({where:{id},
    data:{estado:'RECIBIDA',recibidaEn:new Date()},include:transferInclude});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:row.almacenDestino.sucursalId,
    accion:'TRANSFER_RECEIVED',entidad:'TransferenciaInventario',entidadId:id,
    despues:{estado:'RECIBIDA',lineas:row.transferenciaInventarioLineasComoTransferencia.length}}});
   return this.transferView(changed,u);
  });
 }
}
