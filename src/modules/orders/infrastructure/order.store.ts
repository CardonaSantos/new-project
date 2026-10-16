import {createHash,randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../generated/prisma/client.js';
import {PrismaService} from '../../../infrastructure/database/prisma/prisma.service.js';
import {InventoryPostingEngine} from '../../inventory/infrastructure/prisma/inventory-posting.engine.js';
import {variantPrice,modifierPrice,permission,serial} from '../../catalog/infrastructure/prisma/catalog-prisma.shared.js';
import type {Principal} from '../../auth/application/auth.service.js';
import {orderQty,cash,cents,unique,assertRoute} from '../domain/order.policy.js';
import type {OrderCreateDto,AddLinesDto,OrderPageDto,KitchenPageDto,StationDto,RouteDto,OrderLineDto,TableOpenDto} from '../presentation/dto/order.dto.js';
import {toBase} from '../../recipes/infrastructure/prisma/recipe-units.js';
import {demand} from '../../recipes/domain/recipe.policy.js';
import {localDate} from '../../inventory/domain/stock.policy.js';
type Tx=Prisma.TransactionClient;
const lineDetails={variante:{select:{id:true,sku:true,nombre:true,producto:{select:{id:true,nombre:true,tipo:true}}}},
 ordenLineaModificadoresComoOrdenLinea:{select:{id:true,nombreSnapshot:true,cantidad:true,recargoUnitario:true,modificadorId:true}},
 comandaLineasComoOrdenLinea:{select:{id:true,comandaId:true,cantidad:true,listaEn:true,canceladaEn:true}}} as const;
const orderDetails={ordenLineasComoOrden:{include:lineDetails},comandasComoOrden:{
 include:{estacion:{select:{id:true,nombre:true}},comandaLineasComoComanda:true}},
 cuentasComoOrden:{include:{cuentaLineasComoCuenta:true}},ocupacionMesa:{include:{mesa:true}},
 eventoOrdenesComoOrden:{orderBy:{creadoEn:'asc' as const}}} as const;
const commandDetails={estacion:{select:{id:true,nombre:true,ubicacionConsumoId:true,sucursalId:true}},
 orden:{select:{id:true,numero:true,sucursalId:true,modalidad:true,estado:true}},
 comandaLineasComoComanda:{include:{ordenLinea:{include:{
  variante:{select:{id:true,nombre:true,producto:{select:{tipo:true}}}},
  ordenLineaModificadoresComoOrdenLinea:true}}}}} as const;
const signed=(v:Prisma.Decimal)=>v.toFixed(6);
@Injectable()
export class OrderStore{
 constructor(private readonly db:PrismaService,private readonly engine:InventoryPostingEngine){}
 private tx<T>(callback:(tx:Tx)=>Promise<T>){
  return this.db.$transaction(callback,serial);
 }
 private async audit(tx:Tx,u:Principal,branch:string,action:string,type:string,id:string,detail:unknown){
  await tx.eventoAuditoria.create({data:{usuarioId:u.id,sucursalId:branch,
   accion:action,entidad:type,entidadId:id,
   despues:detail as Prisma.InputJsonValue}});
 }
 private async event(tx:Tx,u:Principal,orderId:string,action:string,detail:unknown){
  await tx.eventoOrden.create({data:{ordenId:orderId,usuarioId:u.id,accion:action,
   detalles:detail as Prisma.InputJsonValue}});
 }
 private hash(input:unknown){return createHash('sha256').update(JSON.stringify(input)).digest('hex');}
 private async idem(tx:Tx,key:string,operation:string,hash:string){
  const existing=await tx.operacionIdempotente.findUnique({where:{clave:key}});
  if(!existing)return null;
  if(existing.operacion!==operation||existing.hashSolicitud!==hash)
   throw new ConflictException('Clave idempotente reutilizada con otro contenido');
  if(!existing.finalizada||!existing.resultado||typeof existing.resultado!=='object')
   throw new ConflictException('Operación aún pendiente');
  const object=existing.resultado as Record<string,unknown>;
  if(typeof object.id!=='string')throw new ConflictException('Resultado idempotente corrupto');
  return object.id;
 }
 private async remember(tx:Tx,key:string,operation:string,hash:string,id:string){
  await tx.operacionIdempotente.create({data:{clave:key,operacion,hashSolicitud:hash,
   resultado:{id},finalizada:true,expiraEn:new Date(Date.now()+30*86400*1000)}});
 }
 private async priceLines(tx:Tx,branch:string,lines:OrderLineDto[],at:Date){
  const result:Array<{varianteId:string;nombreSnapshot:string;cantidad:Prisma.Decimal;
   precioUnitario:Prisma.Decimal;subtotal:Prisma.Decimal;notasCocina?:string;
   modifiers:Array<{modificadorId:string;nombreSnapshot:string;cantidad:number;recargoUnitario:Prisma.Decimal}>}>=[];
  for(const line of lines){
   const quantity=orderQty(line.cantidad);
   const v=await tx.varianteProducto.findUnique({where:{id:line.varianteId},
    include:{producto:true,configuracionesSucursal:true}});
   if(!v||!v.activo||!v.producto.activo||!v.producto.visibleEnMenu)
    throw new ConflictException('Variante no disponible para venta');
   const branchConfig=v.configuracionesSucursal.find(x=>x.sucursalId===branch);
   if(branchConfig&&(!branchConfig.habilitada||(branchConfig.pausadaHasta&&branchConfig.pausadaHasta>at)))
    throw new ConflictException('Variante pausada o deshabilitada en sucursal');
   const price=await variantPrice(tx,v.id,branch,at);
   if(!price)throw new ConflictException('Variante sin precio vigente en sucursal');
   unique(line.modificadores??[],m=>m.modificadorId,'Modificador duplicado');
   const selected=line.modificadores??[];
   const groups=await tx.varianteGrupoModificador.findMany({where:{varianteId:v.id},include:{grupo:true}});
   const groupMap=new Map(groups.map(g=>[g.grupoId,g]));
   const groupCounts=new Map<string,number>();
   const modifiers:typeof result[number]['modifiers']=[];
   let surcharge=new Prisma.Decimal(0);
   for(const entry of selected){
    const mod=await tx.modificador.findUnique({where:{id:entry.modificadorId},include:{grupo:true}});
    if(!mod||!mod.activo||!mod.grupo.activo||!groupMap.has(mod.grupoId))
     throw new ConflictException('Extra no disponible para esta variante');
    const units=entry.cantidad??1;
    groupCounts.set(mod.grupoId,(groupCounts.get(mod.grupoId)??0)+units);
    const addon=await modifierPrice(tx,mod.id,branch,at);
    surcharge=surcharge.plus(addon.mul(units));
    modifiers.push({modificadorId:mod.id,nombreSnapshot:mod.nombre,cantidad:units,recargoUnitario:addon});
   }
   for(const g of groups){
    const n=groupCounts.get(g.grupoId)??0;
    if(n<g.grupo.minimo||g.grupo.maximo!==null&&n>g.grupo.maximo)
     throw new ConflictException('Selección de modificadores no cumple límites del grupo');
   }
   const unit=cents(price.importe.plus(surcharge));
   result.push({varianteId:v.id,nombreSnapshot:v.producto.nombre+' — '+v.nombre,
    cantidad:quantity,precioUnitario:unit,subtotal:cents(unit.mul(quantity)),
    notasCocina:line.notasCocina,modifiers});
  }
  return result;
 }
 private async insertLines(tx:Tx,orderId:string,branch:string,input:OrderLineDto[]){
  const quoted=await this.priceLines(tx,branch,input,new Date());
  const ids:string[]=[];
  for(const q of quoted){
   const row=await tx.ordenLinea.create({data:{ordenId,varianteId:q.varianteId,
    nombreSnapshot:q.nombreSnapshot,cantidad:q.cantidad,precioUnitario:q.precioUnitario,
    subtotal:q.subtotal,notasCocina:q.notasCocina,
    ordenLineaModificadoresComoOrdenLinea:{create:q.modifiers}}});
   ids.push(row.id);
  }
  const all=await tx.ordenLinea.findMany({where:{ordenId,canceladaEn:null}});
  const subtotal=cents(all.reduce((sum,l)=>sum.plus(l.subtotal),new Prisma.Decimal(0)));
  await tx.orden.update({where:{id:orderId},data:{subtotal,total:subtotal,version:{increment:1}}});
  return ids;
 }
 private async route(tx:Tx,branch:string,line:{varianteId:string}){
  const variant=await tx.varianteProducto.findUniqueOrThrow({where:{id:line.varianteId},
   include:{producto:true}});
  if(variant.producto.tipo==='SERVICIO')return null;
  const routes=await tx.rutaPreparacion.findMany({where:{estacion:{sucursalId:branch,activa:true},
   OR:[{varianteId:line.varianteId},{categoriaId:variant.producto.categoriaId??undefined}]},
   include:{estacion:true},orderBy:[{prioridad:'desc'},{id:'asc'}]});
  const matching=routes.filter(r=>r.varianteId===line.varianteId||
   r.varianteId===null&&r.categoriaId&&r.categoriaId===variant.producto.categoriaId);
  const chosen=matching.sort((a,b)=>Number(b.varianteId!==null)-Number(a.varianteId!==null)||
   b.prioridad-a.prioridad||a.id.localeCompare(b.id))[0];
  if(!chosen)throw new ConflictException('Variante sin ruta activa de cocina');
  if(!chosen.estacion.ubicacionConsumoId)
   throw new ConflictException('Estación sin ubicación de consumo');
  return chosen.estacionId;
 }
 private async dispatchTx(tx:Tx,u:Principal,orderId:string){
  const order=await tx.orden.findUnique({where:{id:orderId},include:{
   ordenLineasComoOrden:{include:{comandaLineasComoOrdenLinea:true}}}});
  if(!order)throw new NotFoundException('Orden inexistente');
  await permission(tx,u.id,'orders.manage',order.sucursalId);
  if(order.estado!=='ABIERTA')throw new ConflictException('La orden no está abierta');
  const groups=new Map<string,string[]>();
  for(const line of order.ordenLineasComoOrden){
   if(line.canceladaEn||line.comandaLineasComoOrdenLinea.some(x=>!x.canceladaEn))continue;
   const station=await this.route(tx,order.sucursalId,line);
   if(!station)continue;
   groups.set(station,[...(groups.get(station)??[]),line.id]);
  }
  const created:string[]=[];
  for(const [station,ids] of groups){
   const cmd=await tx.comanda.create({data:{ordenId,estacionId:station,numero:'K-'+randomUUID(),
    comandaLineasComoComanda:{create:ids.map(id=>({
     ordenLineaId:id,cantidad:order.ordenLineasComoOrden.find(l=>l.id===id)!.cantidad
    }))}}});
   await tx.eventoComanda.create({data:{comandaId:cmd.id,usuarioId:u.id,accion:'ENVIADA'}});
   created.push(cmd.id);
  }
  if(created.length){
   await this.event(tx,u,orderId,'ENVIADA_COCINA',{comandas:created});
   for(const id of created)await tx.eventoOutbox.create({data:{tipo:'KITCHEN_COMMAND_CREATED',
    agregado:'Comanda',agregadoId:id,payload:{id,ordenId} as Prisma.InputJsonValue}});
  }
  return created;
 }
 private async detailTx(tx:Tx,u:Principal,id:string){
  const row=await tx.orden.findUnique({where:{id},include:orderDetails});
  if(!row)throw new NotFoundException('Orden inexistente');
  await permission(tx,u.id,'orders.read',row.sucursalId);
  return row;
 }
 async detail(u:Principal,id:string){return this.tx(tx=>this.detailTx(tx,u,id));}
 async list(u:Principal,q:OrderPageDto){
  await permission(this.db as unknown as Tx,u.id,'orders.read',q.sucursalId);
  const where:Prisma.OrdenWhereInput={sucursalId:q.sucursalId,...(q.estado?{estado:q.estado}:{})};
  const [data,total]=await this.db.$transaction([
   this.db.orden.findMany({where,include:{_count:{select:{ordenLineasComoOrden:true,comandasComoOrden:true}}},
    orderBy:{abiertaEn:'desc'},skip:(q.page-1)*q.limit,take:q.limit}),
   this.db.orden.count({where})]);
  return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
 }
 async create(u:Principal,d:OrderCreateDto){
  const key=d.claveOperacion??'ORD:'+randomUUID();const hash=this.hash({d,u:u.id});
  const id=await this.tx(async tx=>{
   await permission(tx,u.id,'orders.create',d.sucursalId);
   const old=await this.idem(tx,key,'ORDER_CREATE',hash);if(old)return old;
   const branch=await tx.sucursal.findUnique({where:{id:d.sucursalId}});
   if(!branch?.activa)throw new ConflictException('Sucursal inexistente o inactiva');
   if(d.modalidad==='MESA'&&!d.ocupacionMesaId)throw new BadRequestException('MESA requiere ocupación');
   if(d.modalidad!=='MESA'&&d.ocupacionMesaId)throw new BadRequestException('Ocupación solo aplica a MESA');
   if(d.ocupacionMesaId){
    const occ=await tx.ocupacionMesa.findUnique({where:{id:d.ocupacionMesaId},include:{mesa:{include:{sala:true}}}});
    if(!occ||occ.cerradaEn||occ.mesa.sala.sucursalId!==d.sucursalId)throw new ConflictException('Ocupación no válida');
   }
   const row=await tx.orden.create({data:{numero:'ORD-'+randomUUID(),sucursalId:d.sucursalId,
    origen:d.origen??'CAJA',modalidad:d.modalidad,usuarioId:u.id,
    ocupacionMesaId:d.ocupacionMesaId,clienteId:d.clienteId,observaciones:d.observaciones}});
   await this.insertLines(tx,row.id,d.sucursalId,d.lineas);
   await tx.cuenta.create({data:{ordenId:row.id,total:await this.orderTotal(tx,row.id)}});
   if(d.enviarCocina!==false)await this.dispatchTx(tx,u,row.id);
   await this.event(tx,u,row.id,'CREADA',{lineas:d.lineas.length});
   await this.remember(tx,key,'ORDER_CREATE',hash,row.id);
   return row.id;
  });
  return this.detail(u,id);
 }
 private async orderTotal(tx:Tx,id:string){
  const row=await tx.orden.findUniqueOrThrow({where:{id}});
  return row.total;
 }
 async add(u:Principal,id:string,d:AddLinesDto){
  const hash=this.hash({id,d,u:u.id});
  await this.tx(async tx=>{
   const order=await tx.orden.findUnique({where:{id}});
   if(!order)throw new NotFoundException('Orden inexistente');
   await permission(tx,u.id,'orders.manage',order.sucursalId);
   const old=await this.idem(tx,d.claveOperacion,'ORDER_ADD_LINES',hash);if(old)return;
   if(order.estado!=='ABIERTA')throw new ConflictException('La orden está cerrada');
   const lines=await this.insertLines(tx,id,order.sucursalId,d.lineas);
   await tx.cuenta.updateMany({where:{ordenId:id,estado:'ABIERTA'},data:{
    total:await this.orderTotal(tx,id)}});
   if(d.enviarCocina!==false)await this.dispatchTx(tx,u,id);
   await this.event(tx,u,id,'LINEAS_AGREGADAS',{lineas:lines});
   await this.remember(tx,d.claveOperacion,'ORDER_ADD_LINES',hash,id);
  });
  return this.detail(u,id);
 }
 async dispatch(u:Principal,id:string){
  await this.tx(tx=>this.dispatchTx(tx,u,id));
  return this.detail(u,id);
 }
 async cancel(u:Principal,id:string){
  await this.tx(async tx=>{
   const row=await tx.orden.findUnique({where:{id},include:{comandasComoOrden:true}});
   if(!row)throw new NotFoundException('Orden inexistente');
   await permission(tx,u.id,'orders.manage',row.sucursalId);
   if(row.estado==='CANCELADA')return;
   if(row.estado!=='ABIERTA')throw new ConflictException('No se puede cancelar');
   if(row.comandasComoOrden.some(c=>c.estado==='PREPARANDO'||c.estado==='LISTA'))
    throw new ConflictException('Hay preparaciones iniciadas; requiere resolución operativa');
   await tx.comanda.updateMany({where:{ordenId:id,estado:'PENDIENTE'},data:{estado:'CANCELADA',canceladaEn:new Date()}});
   await tx.ordenLinea.updateMany({where:{ordenId:id,canceladaEn:null},data:{canceladaEn:new Date()}});
   await tx.orden.update({where:{id},data:{estado:'CANCELADA',canceladaEn:new Date()}});
   await this.event(tx,u,id,'CANCELADA',{});
  });
  return this.detail(u,id);
 }
 async kitchen(u:Principal,q:KitchenPageDto){
  await permission(this.db as unknown as Tx,u.id,'kitchen.read',q.sucursalId);
  const where:Prisma.ComandaWhereInput={estacion:{sucursalId:q.sucursalId},
   ...(q.estacionId?{estacionId:q.estacionId}:{}),...(q.estado?{estado:q.estado}:{})};
  const [data,total]=await this.db.$transaction([
   this.db.comanda.findMany({where,include:commandDetails,orderBy:{enviadaEn:'asc'},
    skip:(q.page-1)*q.limit,take:q.limit}),this.db.comanda.count({where})]);
  return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};
 }
 async kitchenDetail(u:Principal,id:string){
  const row=await this.db.comanda.findUnique({where:{id},include:commandDetails});
  if(!row)throw new NotFoundException('Comanda inexistente');
  await permission(this.db as unknown as Tx,u.id,'kitchen.read',row.estacion.sucursalId);
  return row;
 }
 async kitchenStart(u:Principal,id:string){
  return this.tx(async tx=>{
   const cmd=await tx.comanda.findUnique({where:{id},include:{
    estacion:true,orden:true,comandaLineasComoComanda:{include:{ordenLinea:{
     include:{variante:{include:{producto:true}},ordenLineaModificadoresComoOrdenLinea:true}}}}}});
   if(!cmd)throw new NotFoundException('Comanda inexistente');
   await permission(tx,u.id,'kitchen.manage',cmd.estacion.sucursalId);
   if(cmd.estado==='PREPARANDO'||cmd.estado==='LISTA')return {id,estado:cmd.estado};
   if(cmd.estado!=='PENDIENTE'||cmd.orden.estado!=='ABIERTA')
    throw new ConflictException('Comanda no pendiente');
   const config=await tx.configuracionSucursal.findUnique({where:{sucursalId:cmd.estacion.sucursalId}});
   if(config?.exigeCobroAntesPreparar){
    const unpaid=await tx.cuenta.findFirst({where:{ordenId:cmd.ordenId,pagado:{lt:cmd.orden.total}}});
    if(unpaid)throw new ConflictException('Pago requerido antes de preparar');
   }
   if(!cmd.estacion.ubicacionConsumoId)throw new ConflictException('Estación sin ubicación de consumo');
   for(const cl of cmd.comandaLineasComoComanda){
    const line=cl.ordenLinea;
    if(cl.canceladaEn)continue;
    if(line.variante.producto.tipo==='PREPARADO')
     await this.consumeRecipe(tx,u,cmd,cl);
    else if(line.variante.producto.tipo==='INVENTARIABLE')
     await this.consumePhysical(tx,u,cmd,cl);
   }
   await tx.comanda.update({where:{id},data:{estado:'PREPARANDO',iniciadaEn:new Date()}});
   await tx.eventoComanda.create({data:{comandaId:id,usuarioId:u.id,accion:'PREPARANDO'}});
   await tx.eventoOutbox.create({data:{tipo:'KITCHEN_COMMAND_STARTED',agregado:'Comanda',
    agregadoId:id,payload:{id} as Prisma.InputJsonValue}});
   return {id,estado:'PREPARANDO'};
  });
 }
 async kitchenReady(u:Principal,id:string){
  await this.tx(async tx=>{
   const cmd=await tx.comanda.findUnique({where:{id},include:{estacion:true}});
   if(!cmd)throw new NotFoundException('Comanda inexistente');
   await permission(tx,u.id,'kitchen.manage',cmd.estacion.sucursalId);
   if(cmd.estado==='LISTA')return;
   if(cmd.estado!=='PREPARANDO')throw new ConflictException('Debe iniciar preparación');
   await tx.comanda.update({where:{id},data:{estado:'LISTA',listaEn:new Date(),
    comandaLineasComoComanda:{updateMany:{where:{canceladaEn:null},data:{listaEn:new Date()}}}}});
   await tx.eventoComanda.create({data:{comandaId:id,usuarioId:u.id,accion:'LISTA'}});
   await tx.eventoOutbox.create({data:{tipo:'KITCHEN_COMMAND_READY',agregado:'Comanda',
    agregadoId:id,payload:{id} as Prisma.InputJsonValue}});
  });
  return this.kitchenDetail(u,id);
 }
 async kitchenCancel(u:Principal,id:string){
  await this.tx(async tx=>{
   const cmd=await tx.comanda.findUnique({where:{id},include:{estacion:true}});
   if(!cmd)throw new NotFoundException('Comanda inexistente');
   await permission(tx,u.id,'kitchen.manage',cmd.estacion.sucursalId);
   if(cmd.estado==='CANCELADA')return;
   if(cmd.estado!=='PENDIENTE')throw new ConflictException('Solo se cancela antes de preparación');
   await tx.comanda.update({where:{id},data:{estado:'CANCELADA',canceladaEn:new Date(),
    comandaLineasComoComanda:{updateMany:{where:{canceladaEn:null},data:{canceladaEn:new Date()}}}}});
   await tx.eventoComanda.create({data:{comandaId:id,usuarioId:u.id,accion:'CANCELADA'}});
  });
  return this.kitchenDetail(u,id);
 }
 private async spend(tx:Tx,u:Principal,commandId:string,consumptionId:string,articleId:string,
  locationId:string,amount:Prisma.Decimal){
  const positions=await tx.existencia.findMany({where:{articuloId:articleId,
   ubicacionId:locationId,cantidad:{gt:0}},include:{lote:true}});
  const place=await this.engine.location(tx,locationId);
  const today=localDate(new Date(),place.almacen.sucursal.zonaHoraria);
  const eligible=positions.filter(p=>!p.lote||!p.lote.bloqueado&&
   (!p.lote.fechaVencimiento||p.lote.fechaVencimiento.toISOString().slice(0,10)>=today));
  eligible.sort((a,b)=>(a.lote?.fechaVencimiento?.toISOString()??'9999').localeCompare(
   b.lote?.fechaVencimiento?.toISOString()??'9999')||a.id.localeCompare(b.id));
  if(eligible.reduce((v,p)=>v.plus(p.cantidad),new Prisma.Decimal(0)).lt(amount))
   throw new ConflictException('Ingrediente insuficiente para preparar');
  let remaining=amount,index=0;
  for(const row of eligible){
   if(remaining.isZero())break;
   const take=Prisma.Decimal.min(remaining,row.cantidad);
   const posting=await this.engine.post(tx,{actorId:u.id,articuloId:articleId,
    ubicacionId:locationId,loteId:row.loteId,cantidad:signed(take),
    direction:'OUT',tipo:'CONSUMO',permission:'kitchen.manage',
    claveOperacion:'CMD:'+commandId+':'+consumptionId+':'+index++,
    referenciaTipo:'CONSUMO_ORDEN',referenciaId:consumptionId});
   await tx.consumoOrdenLinea.create({data:{consumoId:consumptionId,articuloId:articleId,
    ubicacionId:locationId,loteId:row.loteId,cantidad:take,
    costoUnitario:new Prisma.Decimal(posting.costoUnitario),movimientoId:posting.movementId}});
   remaining=remaining.minus(take);
  }
 }
 private async consumeRecipe(tx:Tx,u:Principal,cmd:{
  id:string;ordenId:string;estacion:{ubicacionConsumoId:string|null;sucursalId:string}},
  cl:{id:string;cantidad:Prisma.Decimal;ordenLinea:{
   varianteId:string;ordenLineaModificadoresComoOrdenLinea:Array<{modificadorId:string;cantidad:number}>}}){
  const line=cl.ordenLinea;
  const recipe=await tx.receta.findFirst({where:{tipo:'VENTA',varianteId:line.varianteId,activa:true},
   include:{recetaVersionesComoReceta:{where:{activa:true,publicadaEn:{not:null}},
    include:{recetaComponentesComoRecetaVersion:true}}}});
  const version=recipe?.recetaVersionesComoReceta[0];
  if(!version)throw new ConflictException('Variante sin receta publicada');
  const already=await tx.consumoOrden.findFirst({where:{comandaLineaId:cl.id,tipo:'RECETA'}});
  if(already)return;
  const result=await tx.consumoOrden.create({data:{ordenId:cmd.ordenId,comandaLineaId:cl.id,
   tipo:'RECETA',recetaVersionId:version.id,cantidadPreparada:cl.cantidad}});
  const factors=new Map<string,Prisma.Decimal>();
  const factor=cl.cantidad.div(version.rendimiento);
  for(const c of version.recetaComponentesComoRecetaVersion){
   const q=demand(c,factor);
   const base=await toBase(tx,c.articuloId,c.unidadId,q);
   factors.set(c.articuloId,(factors.get(c.articuloId)??new Prisma.Decimal(0)).plus(base));
  }
  const extras=await tx.modificadorComponente.findMany({where:{
   modificadorId:{in:line.ordenLineaModificadoresComoOrdenLinea.map(m=>m.modificadorId)}}});
  for(const m of line.ordenLineaModificadoresComoOrdenLinea){
   for(const part of extras.filter(x=>x.modificadorId===m.modificadorId)){
    const q=await toBase(tx,part.articuloId,part.unidadId,part.cantidad.mul(cl.cantidad).mul(m.cantidad));
    if(part.efecto==='SUSTITUIR'){
     if(!part.sustituyeArticuloId)throw new ConflictException('Sustitución inválida');
     factors.delete(part.sustituyeArticuloId);
     factors.set(part.articuloId,(factors.get(part.articuloId)??new Prisma.Decimal(0)).plus(q));
    }else if(part.efecto==='RESTAR'){
     factors.set(part.articuloId,Prisma.Decimal.max(0,(factors.get(part.articuloId)??new Prisma.Decimal(0)).minus(q)));
    }else factors.set(part.articuloId,(factors.get(part.articuloId)??new Prisma.Decimal(0)).plus(q));
   }
  }
  for(const [articleId,q] of factors)if(q.gt(0))
   await this.spend(tx,u,cmd.id,result.id,articleId,cmd.estacion.ubicacionConsumoId!,q);
 }
 private async consumePhysical(tx:Tx,u:Principal,cmd:{
  id:string;ordenId:string;estacion:{ubicacionConsumoId:string|null;sucursalId:string}},
  cl:{id:string;cantidad:Prisma.Decimal;ordenLinea:{varianteId:string}}){
  const variant=await tx.varianteProducto.findUnique({where:{id:cl.ordenLinea.varianteId}});
  if(!variant?.articuloInventarioId)throw new ConflictException('Variante sin artículo de inventario');
  const existing=await tx.consumoOrden.findFirst({where:{comandaLineaId:cl.id,tipo:'RECETA'}});
  if(existing)return;
  const receipt=await tx.consumoOrden.create({data:{ordenId:cmd.ordenId,comandaLineaId:cl.id,
   tipo:'RECETA',cantidadPreparada:cl.cantidad}});
  await this.spend(tx,u,cmd.id,receipt.id,variant.articuloInventarioId,
   cmd.estacion.ubicacionConsumoId!,cl.cantidad);
 }
 async stations(u:Principal,b:string){
  await permission(this.db as unknown as Tx,u.id,'kitchen.read',b);
  return this.db.estacionPreparacion.findMany({where:{sucursalId:b},
   include:{rutaPreparacionesComoEstacion:true},orderBy:{nombre:'asc'}});
 }
 async stationCreate(u:Principal,d:StationDto){
  return this.tx(async tx=>{
   await permission(tx,u.id,'kitchen.manage',d.sucursalId);
   if(d.ubicacionConsumoId){
    const l=await this.engine.location(tx,d.ubicacionConsumoId);
    if(l.almacen.sucursalId!==d.sucursalId)throw new ConflictException('Ubicación fuera de sucursal');
   }
   return tx.estacionPreparacion.create({data:d});
  });
 }
 async routeCreate(u:Principal,d:RouteDto){
  return this.tx(async tx=>{
   assertRoute(!!d.varianteId,!!d.categoriaId);
   const station=await tx.estacionPreparacion.findUnique({where:{id:d.estacionId}});
   if(!station?.activa)throw new ConflictException('Estación inexistente o inactiva');
   await permission(tx,u.id,'kitchen.manage',station.sucursalId);
   if(d.varianteId&&!await tx.varianteProducto.findUnique({where:{id:d.varianteId}}))
    throw new NotFoundException('Variante inexistente');
   if(d.categoriaId&&!await tx.categoria.findUnique({where:{id:d.categoriaId}}))
    throw new NotFoundException('Categoría inexistente');
   return tx.rutaPreparacion.create({data:{
    estacionId:d.estacionId,varianteId:d.varianteId,categoriaId:d.categoriaId,prioridad:d.prioridad??0}});
  });
 }
 async tables(u:Principal,b:string){
  await permission(this.db as unknown as Tx,u.id,'tables.read',b);
  return this.db.mesa.findMany({where:{sala:{sucursalId:b}},include:{
   sala:true,ocupacionMesasComoMesa:{where:{cerradaEn:null}}},orderBy:{numero:'asc'}});
 }
 async tableOpen(u:Principal,d:TableOpenDto){
  return this.tx(async tx=>{
   const table=await tx.mesa.findUnique({where:{id:d.mesaId},include:{sala:true}});
   if(!table?.activa||!table.sala.activa)throw new ConflictException('Mesa inactiva');
   await permission(tx,u.id,'tables.manage',table.sala.sucursalId);
   if(await tx.ocupacionMesa.findFirst({where:{mesaId:d.mesaId,cerradaEn:null}}))
    throw new ConflictException('Mesa ocupada');
   return tx.ocupacionMesa.create({data:{mesaId:d.mesaId,abiertaPorId:u.id}});
  });
 }
 async tableClose(u:Principal,id:string){
  return this.tx(async tx=>{
   const occ=await tx.ocupacionMesa.findUnique({where:{id},include:{mesa:{include:{sala:true}}}});
   if(!occ)throw new NotFoundException('Ocupación inexistente');
   await permission(tx,u.id,'tables.manage',occ.mesa.sala.sucursalId);
   if(occ.cerradaEn)return occ;
   if(await tx.orden.findFirst({where:{ocupacionMesaId:id,estado:'ABIERTA'}}))
    throw new ConflictException('Mesa con orden abierta');
   return tx.ocupacionMesa.update({where:{id},data:{cerradaEn:new Date()}});
  });
 }
}
