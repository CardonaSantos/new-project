import {createHash} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {amount,cost,price,qty,requireReference,validDay} from '../../domain/stock.policy.js';
import {InventoryPostingEngine} from './inventory-posting.engine.js';
import {InventoryDocumentsStore} from './inventory-documents.store.js';
import {locationBookValues} from './inventory-ledger.js';
import {bookKey,allocatePoolBookValues} from '../../domain/inventory-valuation.policy.js';
import type {StockBranchDto,LotCreateDto,LotStatusDto,ManualPostingDto,CountCreateDto,TransferCreateDto} from '../../presentation/http/dto/inventory-operations.dto.js';
type StockQuery=StockBranchDto;
const meta=(page:number,limit:number,total:number)=>({page,limit,total,totalPages:Math.ceil(total/limit)});
function sanitize<T>(value:T,allowed:boolean):T{
 if(allowed)return value;
 const visit=(v:unknown):unknown=>{
  if(Array.isArray(v))return v.map(visit);
  if(!v||typeof v!=='object'||v instanceof Date)return v;
  return Object.fromEntries(Object.entries(v).filter(([k])=>![
   'costoUnitario','costoTotal','costoPromedio','costoEnTransito','valorInventario',
   'valor','costos','capasEnTransito','costoOrigen','costoUnitarioEntrada','allocations'].includes(k))
   .map(([k,x])=>[k,visit(x)]));
 };
 return visit(value) as T;
}
@Injectable()
export class InventoryOperationsStore{
 constructor(private readonly db:PrismaService,private readonly identity:IdentityRepository,
  private readonly engine:InventoryPostingEngine,private readonly docs:InventoryDocumentsStore){}
 private async globalTx(tx:Prisma.TransactionClient,u:Principal,permission:string){
  const role=await tx.usuarioRol.findFirst({where:{usuarioId:u.id,usuario:{activo:true},
   sucursalId:null,rol:{activo:true,alcance:'GLOBAL',
    rolPermisosComoRol:{some:{permiso:{codigo:permission}}}}}});
  if(!role)throw new ForbiddenException('Permiso global requerido');
 }
 private async permission(u:Principal,branch:string,permission:string){
  if(!(await this.identity.capabilities(u.id,branch)).includes(permission))throw new ForbiddenException('Acceso denegado a sucursal');
 }
 private async costs(u:Principal,branch:string){return (await this.identity.capabilities(u.id,branch)).includes('inventory.costs.read');}
 private async listScope(u:Principal,q:StockQuery,required='inventory.read'){
  await this.permission(u,q.sucursalId,required);
  const branch=await this.db.sucursal.findUnique({where:{id:q.sucursalId}});
  if(!branch)throw new NotFoundException('Sucursal no encontrada');
  return {sucursalId:q.sucursalId,almacenId:q.almacenId,ubicacionId:q.ubicacionId,
   articuloId:q.articuloId,loteId:q.loteId};
 }
 async stock(u:Principal,q:StockQuery){
  const f=await this.listScope(u,q);
  const where:Prisma.ExistenciaWhereInput={
   ubicacion:{almacen:{sucursalId:f.sucursalId,...(f.almacenId?{id:f.almacenId}:{})},
    ...(f.ubicacionId?{id:f.ubicacionId}:{})},
   ...(f.articuloId?{articuloId:f.articuloId}:{}),
   ...(f.loteId?{loteId:f.loteId}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.existencia.findMany({where,skip:(q.page-1)*q.limit,take:q.limit,
    orderBy:[{articuloId:'asc'},{ubicacionId:'asc'},{id:'asc'}],include:{
    articulo:{include:{unidadBase:true}},ubicacion:{include:{almacen:{include:{sucursal:true}}}},lote:true}}),
   this.db.existencia.count({where})
  ]);
  const withCosts=await this.costs(u,q.sucursalId);
  const company=await this.db.empresaConfiguracion.findFirst();
  const fifo=company?.metodoValoracion==='FIFO';
  let positionValues=new Map<string,Prisma.Decimal>();
  if(withCosts&&!fifo&&rows.length){
   // Load all siblings, not just the current page: rounding must be stable
   // when the same cost pool is split across pages or filtered by lot.
   const locations=[...new Set(rows.map(x=>x.ubicacionId))];
   const articles=[...new Set(rows.map(x=>x.articuloId))];
   const siblings=await this.db.existencia.findMany({where:{
    ubicacionId:{in:locations},articuloId:{in:articles}},
    select:{id:true,articuloId:true,ubicacionId:true,cantidad:true}});
   const books=await locationBookValues(this.db,locations);
   positionValues=allocatePoolBookValues(siblings,books);
  }
  return {data:rows.map(x=>sanitize({id:x.id,articulo:{id:x.articulo.id,codigo:x.articulo.codigo,
   nombre:x.articulo.nombre,tipo:x.articulo.tipo,unidadBase:x.articulo.unidadBase.codigo,
   stockMinimo:x.articulo.stockMinimo?.toFixed(6)??null},ubicacion:{
    id:x.ubicacion.id,codigo:x.ubicacion.codigo,nombre:x.ubicacion.nombre,
    almacen:{id:x.ubicacion.almacen.id,codigo:x.ubicacion.almacen.codigo,nombre:x.ubicacion.almacen.nombre}},
   lote:x.lote?{id:x.lote.id,codigoLote:x.lote.codigoLote,bloqueado:x.lote.bloqueado,
    fechaVencimiento:x.lote.fechaVencimiento?.toISOString().slice(0,10)??null}:null,
   cantidad:qty(x.cantidad),costoPromedio:fifo?null:price(x.costoPromedio),
   valor:fifo?null:price(positionValues.get(x.id)??new Prisma.Decimal(0))},withCosts)),meta:meta(q.page,q.limit,total),
   nota:'Stock físico contabilizado. No contempla reservas de órdenes ni consumos de recetas.'};
 }
 async summary(u:Principal,q:StockQuery){
  const f=await this.listScope(u,q);
  const positions=await this.db.existencia.findMany({where:{
   ubicacion:{almacen:{sucursalId:f.sucursalId,...(f.almacenId?{id:f.almacenId}:{})}},
   ...(f.articuloId?{articuloId:f.articuloId}:{})
  },include:{articulo:{include:{unidadBase:true}},lote:true}});
  const map=new Map<string,{articuloId:string;codigo:string;nombre:string;unidad:string;
   stockMinimo:string|null;cantidad:Prisma.Decimal;bloqueada:Prisma.Decimal;
   valor:Prisma.Decimal}>();
  for(const row of positions){
   const existing=map.get(row.articuloId)??{articuloId:row.articuloId,codigo:row.articulo.codigo,
    nombre:row.articulo.nombre,unidad:row.articulo.unidadBase.codigo,
    stockMinimo:row.articulo.stockMinimo?.toFixed(6)??null,cantidad:new Prisma.Decimal(0),
    bloqueada:new Prisma.Decimal(0),valor:new Prisma.Decimal(0)};
   existing.cantidad=existing.cantidad.plus(row.cantidad);
   if(row.lote?.bloqueado||row.lote?.fechaVencimiento&&row.lote.fechaVencimiento<new Date())
    existing.bloqueada=existing.bloqueada.plus(row.cantidad);
   map.set(row.articuloId,existing);
  }
  const company=await this.db.empresaConfiguracion.findFirst();
  if(company?.metodoValoracion!=='FIFO'){
   const locations=[...new Set(positions.map(x=>x.ubicacionId))];
   const books=await locationBookValues(this.db,locations);
   for(const [key,value] of books){
    const article=map.get(key.split(':')[0]);
    if(article)article.valor=article.valor.plus(value);
   }
  }
  if(company?.metodoValoracion==='FIFO'){
   const layers=await this.db.capaCostoInventario.findMany({where:{
    ubicacion:{almacen:{sucursalId:q.sucursalId,...(q.almacenId?{id:q.almacenId}:{})}},
    ...(q.articuloId?{articuloId:q.articuloId}:{}),
    cantidadRestante:{gt:0}
   }});
   for(const x of map.values())x.valor=new Prisma.Decimal(0);
   for(const layer of layers){
    const entry=map.get(layer.articuloId);
    if(entry)entry.valor=entry.valor.plus(layer.cantidadRestante.mul(layer.costoUnitario));
   }
  }
  const canCost=await this.costs(u,q.sucursalId);
  const data=[...map.values()].map(x=>sanitize({articuloId:x.articuloId,codigo:x.codigo,nombre:x.nombre,
   unidad:x.unidad,cantidad:qty(x.cantidad),cantidadBloqueada:qty(x.bloqueada),
   cantidadUtilizable:qty(x.cantidad.minus(x.bloqueada)),stockMinimo:x.stockMinimo,
   bajoMinimo:x.stockMinimo!==null&&x.cantidad.lessThan(new Prisma.Decimal(x.stockMinimo)),
   valor:price(x.valor)},canCost));
  return {sucursalId:q.sucursalId,totalArticulos:data.length,data,
   metodoValoracion:company?.metodoValoracion??null,
   nota:'Valoración según el método empresarial; no incluye tránsito ni reservas de órdenes.'};
 }
 async lots(u:Principal,q:StockQuery){
  await this.listScope(u,q);
  const where:Prisma.LoteInventarioWhereInput={
   ...(q.articuloId?{articuloId:q.articuloId}:{}),
   existenciasComoLote:{some:{ubicacion:{almacen:{sucursalId:q.sucursalId}}}}
  };
  const [data,total]=await this.db.$transaction([
   this.db.loteInventario.findMany({where,include:{articulo:{select:{id:true,codigo:true,nombre:true}},
    existenciasComoLote:{where:{ubicacion:{almacen:{sucursalId:q.sucursalId}}},
     select:{id:true,ubicacionId:true,cantidad:true}}},orderBy:[{fechaVencimiento:'asc'},{id:'asc'}],
    skip:(q.page-1)*q.limit,take:q.limit}),
   this.db.loteInventario.count({where})
  ]);
  return {data:data.map(x=>({id:x.id,codigoLote:x.codigoLote,articulo:x.articulo,bloqueado:x.bloqueado,
   fechaElaboracion:x.fechaElaboracion?.toISOString().slice(0,10)??null,
   fechaVencimiento:x.fechaVencimiento?.toISOString().slice(0,10)??null,
   cantidad:qty(x.existenciasComoLote.reduce((s,p)=>s.plus(p.cantidad),new Prisma.Decimal(0))),
   posiciones:x.existenciasComoLote.map(p=>({ubicacionId:p.ubicacionId,cantidad:qty(p.cantidad)}))})),
   meta:meta(q.page,q.limit,total)};
 }
 async createLot(u:Principal,dto:LotCreateDto){
  if(!(await this.identity.capabilities(u.id,null)).includes('inventory.articles.manage'))
   throw new ForbiddenException('Requiere gestión global de artículos');
  const codigoLote=dto.codigoLote.trim().toUpperCase();
  if(!codigoLote||codigoLote.length>100)throw new BadRequestException('Código de lote inválido');
  if(dto.fechaElaboracion)validDay(dto.fechaElaboracion);
  if(dto.fechaVencimiento)validDay(dto.fechaVencimiento);
  if(dto.fechaElaboracion&&dto.fechaVencimiento&&dto.fechaElaboracion>dto.fechaVencimiento)
   throw new BadRequestException('Elaboración posterior al vencimiento');
  try{return await this.engine.tx(async tx=>{
   await this.globalTx(tx,u,'inventory.articles.manage');
   const a=await tx.articuloInventario.findUnique({where:{id:dto.articuloId}});
   if(!a||!a.activo||!a.requiereLote)throw new ConflictException('Artículo no controla lotes');
   if(a.requiereVencimiento&&!dto.fechaVencimiento)throw new BadRequestException('Requiere fechaVencimiento');
   // Translate permanent uniqueness failures inside the callback; otherwise
   // the transaction retry wrapper mistakes them for transient contention.
   let row;
   try{
    row=await tx.loteInventario.create({data:{articuloId:a.id,codigoLote,
     fechaElaboracion:dto.fechaElaboracion?validDay(dto.fechaElaboracion):null,
     fechaVencimiento:dto.fechaVencimiento?validDay(dto.fechaVencimiento):null}});
   }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
     throw new ConflictException('Código de lote duplicado para el artículo');
    throw error;
   }
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,accion:'LOT_CREATED',entidad:'LoteInventario',
    entidadId:row.id,despues:{articuloId:a.id,codigoLote}}});
   return {id:row.id,codigoLote:row.codigoLote,articuloId:row.articuloId,
    fechaVencimiento:row.fechaVencimiento?.toISOString().slice(0,10)??null,bloqueado:row.bloqueado};
  });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')
    throw new ConflictException('Código de lote duplicado para el artículo');throw e;}
 }
 async blockLot(u:Principal,id:string,dto:LotStatusDto){
  if(!(await this.identity.capabilities(u.id,null)).includes('inventory.articles.manage'))
   throw new ForbiddenException('Requiere gestión global de artículos');
  if(dto.motivo.trim().length<3)throw new BadRequestException('Motivo obligatorio');
  return this.engine.tx(async tx=>{
   await this.globalTx(tx,u,'inventory.articles.manage');
   const old=await tx.loteInventario.findUnique({where:{id}});
   if(!old)throw new NotFoundException('Lote inexistente');
   const result=await tx.loteInventario.update({where:{id},data:{bloqueado:dto.bloqueado}});
   await tx.eventoAuditoria.create({data:{usuarioId:u.id,accion:'LOT_BLOCK_CHANGED',
    entidad:'LoteInventario',entidadId:id,motivo:dto.motivo,
    antes:{bloqueado:old.bloqueado},despues:{bloqueado:result.bloqueado}}});
   return {id,codigoLote:result.codigoLote,bloqueado:result.bloqueado};
  });
 }
 async manual(u:Principal,kind:'OPENING'|'INBOUND'|'OUTBOUND'|'WASTE',dto:ManualPostingDto){
  requireReference(dto.claveOperacion);amount(dto.cantidad);
  if(kind==='OPENING'||kind==='INBOUND'){
   if(dto.costoUnitario===undefined)throw new BadRequestException('Entrada requiere costoUnitario');
   cost(dto.costoUnitario);
  }else if(dto.costoUnitario!==undefined)throw new BadRequestException('Salidas usan costo calculado por motor, no costo ingresado');
  if(dto.motivo.trim().length<3)throw new BadRequestException('Motivo mínimo 3 caracteres');
  const direction=kind==='OPENING'||kind==='INBOUND'?'IN':'OUT';
  const op='INVENTORY_'+kind;
  const payload={kind,...dto,actor:u.id};const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const posted=await this.engine.tx(async tx=>{
   const old=await tx.operacionIdempotente.findUnique({where:{clave:dto.claveOperacion}});
   if(old){
    if(old.operacion!==op||old.hashSolicitud!==hash||!old.finalizada)
     throw new ConflictException('Clave idempotente reutilizada con datos diferentes o aún pendiente');
    return old.resultado;
   }
   if(direction==='IN'){
    const l=await this.engine.location(tx,dto.ubicacionId);
    await this.engine.allowed(tx,u.id,'inventory.costs.manage',l.almacen.sucursalId);
   }
   if(kind==='OPENING'&&await tx.movimientoInventario.count({where:{
     articuloId:dto.articuloId,ubicacionId:dto.ubicacionId,loteId:dto.loteId??null}})>0)
    throw new ConflictException('La posición ya tiene movimientos; saldo inicial no permitido');
   const result=await this.engine.post(tx,{actorId:u.id,articuloId:dto.articuloId,
    ubicacionId:dto.ubicacionId,loteId:dto.loteId,cantidad:dto.cantidad,direction,
    tipo:kind==='WASTE'?'MERMA':direction==='IN'?'AJUSTE_ENTRADA':'AJUSTE_SALIDA',
    costoUnitario:dto.costoUnitario,claveOperacion:dto.claveOperacion,
    referenciaTipo:op,referenciaId:dto.claveOperacion,nota:dto.motivo,permission:'inventory.adjust',allowBlocked:kind==='WASTE'});
   await tx.operacionIdempotente.create({data:{clave:dto.claveOperacion,operacion:op,hashSolicitud:hash,
    finalizada:true,expiraEn:new Date(Date.now()+365*86400000),resultado:result as unknown as Prisma.InputJsonValue}});
   return result;
  });
  const l=await this.db.ubicacionAlmacen.findUnique({where:{id:dto.ubicacionId},
   include:{almacen:true}});
  return sanitize(posted,!!l&&await this.costs(u,l.almacen.sucursalId));
 }
 async movements(u:Principal,q:StockQuery){
  await this.listScope(u,q);
  const where:Prisma.MovimientoInventarioWhereInput={ubicacion:{almacen:{
   sucursalId:q.sucursalId,...(q.almacenId?{id:q.almacenId}:{})}},
   ...(q.ubicacionId?{ubicacionId:q.ubicacionId}:{}),
   ...(q.articuloId?{articuloId:q.articuloId}:{}),...(q.loteId?{loteId:q.loteId}:{})};
  const [items,total]=await this.db.$transaction([
   this.db.movimientoInventario.findMany({where,include:{articulo:{select:{codigo:true,nombre:true}},
    ubicacion:{select:{nombre:true,codigo:true,almacenId:true}},lote:{select:{codigoLote:true}},
    usuario:{select:{nombre:true}}},orderBy:[{creadoEn:'desc'},{id:'desc'}],
    skip:(q.page-1)*q.limit,take:q.limit}),
   this.db.movimientoInventario.count({where})]);
  const canCost=await this.costs(u,q.sucursalId);
  return {data:items.map(x=>sanitize({id:x.id,articuloId:x.articuloId,articulo:x.articulo,
   ubicacion:x.ubicacion,lote:x.lote,usuario:x.usuario,tipo:x.tipo,cantidad:qty(x.cantidad),
   costoUnitario:price(x.costoUnitario),costoTotal:price(x.costoTotal),
   claveOperacion:x.claveOperacion,referenciaTipo:x.referenciaTipo,referenciaId:x.referenciaId,
   nota:x.nota,creadoEn:x.creadoEn},canCost)),meta:meta(q.page,q.limit,total)};
 }
 async movement(u:Principal,id:string){
  const m=await this.db.movimientoInventario.findUnique({where:{id},include:{ubicacion:{include:{almacen:true}},
   articulo:{include:{unidadBase:true}},lote:true,usuario:{select:{id:true,nombre:true}},
   aplicacionCapaCostosComoMovimientoSalida:{include:{capa:true}}}});
  if(!m)throw new NotFoundException('Movimiento inexistente');
  await this.permission(u,m.ubicacion.almacen.sucursalId,'inventory.read');
  return sanitize({id:m.id,tipo:m.tipo,articulo:{codigo:m.articulo.codigo,nombre:m.articulo.nombre,
   unidad:m.articulo.unidadBase.codigo},ubicacion:m.ubicacion.nombre,lote:m.lote?.codigoLote??null,
   cantidad:qty(m.cantidad),costoUnitario:price(m.costoUnitario),costoTotal:price(m.costoTotal),
   referenciaTipo:m.referenciaTipo,referenciaId:m.referenciaId,claveOperacion:m.claveOperacion,
   nota:m.nota,usuario:m.usuario,creadoEn:m.creadoEn,
   aplicaciones:m.aplicacionCapaCostosComoMovimientoSalida.map(x=>({capaId:x.capaId,
    cantidad:qty(x.cantidad),costoUnitario:price(x.costoUnitario)}))},
   await this.costs(u,m.ubicacion.almacen.sucursalId));
 }
 async valuation(u:Principal,q:StockQuery){
  await this.listScope(u,q,'inventory.reports.read');
  await this.permission(u,q.sucursalId,'inventory.costs.read');
  const rows=await this.db.existencia.findMany({where:{ubicacion:{almacen:{
   sucursalId:q.sucursalId,...(q.almacenId?{id:q.almacenId}:{})}},
   ...(q.articuloId?{articuloId:q.articuloId}:{})},include:{articulo:true,ubicacion:true}});
  const company=await this.db.empresaConfiguracion.findFirst();
  const FIFO=company?.metodoValoracion==='FIFO';
  const locations=[...new Set(rows.map(x=>x.ubicacionId))];
  const layers=FIFO?await this.db.capaCostoInventario.findMany({where:{ubicacionId:{in:locations},
   cantidadRestante:{gt:0},...(q.articuloId?{articuloId:q.articuloId}:{})}}):[];
  const map=new Map<string,Prisma.Decimal>();
  for(const row of rows)if(!map.has(row.articuloId))map.set(row.articuloId,new Prisma.Decimal(0));
  if(!FIFO){
   const books=await locationBookValues(this.db,locations);
   for(const [key,value] of books){
    const article=key.split(':')[0];
    if(map.has(article))map.set(article,map.get(article)!.plus(value));
   }
  }
  if(FIFO)for(const layer of layers){
   map.set(layer.articuloId,(map.get(layer.articuloId)??new Prisma.Decimal(0)).plus(
    layer.cantidadRestante.mul(layer.costoUnitario)));
  }
  const records=[...map].map(([articuloId,v])=>({articuloId,valor:price(v)}));
  return {sucursalId:q.sucursalId,metodoValoracion:company?.metodoValoracion??null,
   valorInventario:price([...map.values()].reduce((sum,x)=>sum.plus(x),new Prisma.Decimal(0))),
   articulos:records,nota:'Valorización de existencias físicas; tránsito se informa en documentos de transferencia.'};
 }
 async expiry(u:Principal,q:StockQuery){
  await this.listScope(u,q,'inventory.reports.read');
  const items=await this.db.existencia.findMany({where:{cantidad:{gt:0},lote:{
   fechaVencimiento:{not:null}},ubicacion:{almacen:{sucursalId:q.sucursalId}}},include:{
    lote:true,articulo:{select:{codigo:true,nombre:true}},ubicacion:{select:{nombre:true}}}});
  const today=new Date().toISOString().slice(0,10);
  return {sucursalId:q.sucursalId,lotes:items.filter(x=>x.lote?.fechaVencimiento).map(x=>({
   codigo:x.articulo.codigo,nombre:x.articulo.nombre,lote:x.lote!.codigoLote,
   vencimiento:x.lote!.fechaVencimiento!.toISOString().slice(0,10),cantidad:qty(x.cantidad),
   ubicacion:x.ubicacion.nombre,bloqueado:x.lote!.bloqueado,
   vencido:x.lote!.fechaVencimiento!.toISOString().slice(0,10)<today
  }))};
 }
 async reconciliation(u:Principal,q:StockQuery){
  await this.listScope(u,q,'inventory.reports.read');
  const [rows,movs,layers]=await Promise.all([
   this.db.existencia.findMany({where:{ubicacion:{almacen:{sucursalId:q.sucursalId}}}}),
   this.db.movimientoInventario.findMany({where:{ubicacion:{almacen:{sucursalId:q.sucursalId}}}}),
   this.db.capaCostoInventario.findMany({where:{ubicacion:{almacen:{sucursalId:q.sucursalId}}}})
  ]);
  const key=(a:string,b:string,c:string|null)=>[a,b,c??''].join(':');
  const balances=new Map<string,Prisma.Decimal>();
  for(const x of rows)balances.set(key(x.articuloId,x.ubicacionId,x.loteId),x.cantidad);
  const ledger=new Map<string,Prisma.Decimal>();
  for(const x of movs){const k=key(x.articuloId,x.ubicacionId,x.loteId);
   ledger.set(k,(ledger.get(k)??new Prisma.Decimal(0)).plus(x.cantidad));}
  const discrepancies=[...new Set([...balances.keys(),...ledger.keys()])].filter(k=>
    !(balances.get(k)??new Prisma.Decimal(0)).equals(ledger.get(k)??new Prisma.Decimal(0))).map(k=>({
     posicion:k,cantidad:qty(balances.get(k)??new Prisma.Decimal(0)),
     kardex:qty(ledger.get(k)??new Prisma.Decimal(0))}));
  const layerTotals=new Map<string,Prisma.Decimal>();
  const positionTotals=new Map<string,Prisma.Decimal>();
  for(const x of layers){const k=key(x.articuloId,x.ubicacionId,null);
   layerTotals.set(k,(layerTotals.get(k)??new Prisma.Decimal(0)).plus(x.cantidadRestante));}
  for(const x of rows){const k=key(x.articuloId,x.ubicacionId,null);
   positionTotals.set(k,(positionTotals.get(k)??new Prisma.Decimal(0)).plus(x.cantidad));}
  const capas=[...new Set([...layerTotals.keys(),...positionTotals.keys()])].filter(k=>
   !(layerTotals.get(k)??new Prisma.Decimal(0)).equals(positionTotals.get(k)??new Prisma.Decimal(0))).map(k=>({
    articuloUbicacion:k,cantidad:qty(positionTotals.get(k)??new Prisma.Decimal(0)),
    capas:qty(layerTotals.get(k)??new Prisma.Decimal(0))}));
  return {sucursalId:q.sucursalId,conciliado:discrepancies.length===0&&capas.length===0,
   diferenciasKardex:discrepancies,diferenciasCapas:capas,
   nota:'No modifica datos; discrepancias requieren investigación y reversas controladas.'};
 }
 createCount(u:Principal,d:CountCreateDto){return this.docs.createCount(u,d);}
 count(u:Principal,id:string){return this.docs.count(u,id);}
 cancelCount(u:Principal,id:string){return this.docs.cancelCount(u,id);}
 confirmCount(u:Principal,id:string){return this.docs.confirmCount(u,id);}
 createTransfer(u:Principal,d:TransferCreateDto){return this.docs.createTransfer(u,d);}
 transfer(u:Principal,id:string){return this.docs.transfer(u,id);}
 cancelTransfer(u:Principal,id:string){return this.docs.cancelTransfer(u,id);}
 dispatch(u:Principal,id:string){return this.docs.dispatch(u,id);}
 receive(u:Principal,id:string){return this.docs.receive(u,id);}
}
