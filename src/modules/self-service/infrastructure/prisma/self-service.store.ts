import {randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,
 NotFoundException,UnauthorizedException} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {OrderService} from '../../../orders/application/order.service.js';
import {CatalogService} from '../../../catalog/application/catalog.service.js';
import {RealtimePort} from '../../../realtime/application/ports/realtime.port.js';
import {SelfServicePort} from '../../application/ports/self-service.repository.js';
import type {SelfServiceAccess,SelfServiceCart,SelfServiceItemInput,SelfServiceSession,
 TableQrIssued,TableQrSummary} from '../../application/contracts/self-service.types.js';
import {digest,randomToken} from '../security/token.util.js';

/** Dining-session window for a table QR scan. Independent of AccesoMesaQR.expiraEn,
 * which is the lifetime of the printed/displayed code itself. */
const SESSION_TTL_MS=3*60*60*1000;
/** Bootstrapped once by prisma/seed.ts (role AUTOSERVICIO_SISTEMA, global scope,
 * permissions orders.create / orders.manage / catalog.read). Orden.usuarioId is
 * NOT NULL, so every self-service order needs a real attributable Usuario. */
const SERVICE_ACCOUNT_EMAIL='autoservicio@sistema.interno';

/** Narrow shape read from CatalogService.branchMenu's output (declared Promise<unknown>
 * on CatalogRepositoryPort; see catalog-menu.store.ts#branchMenu + catalog-media.service.ts#enrich
 * for the full raw projection this is read from). Only the fields menu() below extracts. */
/** A single gallery photo as left by CatalogMediaService.enrich(): url is either a
 * permanent urlPublica or a short-lived (300s) signed URL — see that service for detail. */
interface RawMediaPhoto{mediaId:string;principal:boolean;orden:number;url:string}
interface RawBranchMenu{sucursalId:string;menus:Array<{id:string;nombre:string;descripcion:string|null;
 secciones:Array<{id:string;nombre:string;orden:number;items:Array<{id:string;precio:string;moneda:string;
  variante:{id:string;nombre:string;imagenPrincipalUrl:string|null;imagenes?:RawMediaPhoto[];
   producto:{nombre:string;descripcion:string|null;imagenPrincipalUrl:string|null;imagenes?:RawMediaPhoto[];
    tipo:'PREPARADO'|'INVENTARIABLE'|'SERVICIO'}};
  gruposModificadores:Array<{grupoId:string;grupo:string;orden:number;minimo:number;maximo:number;
   opciones:Array<{id:string;nombre:string;recargo:string}>}>;
 }>}>}>}
type RawMenuItem=RawBranchMenu['menus'][number]['secciones'][number]['items'][number];

/** Narrow shape read from OrderService.detail()/create()/add()'s raw Orden row
 * (orderInclude in orders/infrastructure/prisma/order-shared.ts). Only the
 * fields shapeOrder() below extracts; everything else (usuarioId, cliente PII,
 * recipe composition snapshots, kitchen ticket state, claveOperacion) is
 * deliberately left out of the customer-facing projection. */
interface RawOrden{id:string;numero:string;estado:'ABIERTA'|'CERRADA'|'CANCELADA';
 subtotal:{toFixed(n:number):string};descuentoTotal:{toFixed(n:number):string};
 total:{toFixed(n:number):string};
 ordenLineasComoOrden:Array<{id:string;nombreSnapshot:string;notasCocina:string|null;
  cantidad:{toFixed(n:number):string};precioUnitario:{toFixed(n:number):string};
  descuento:{toFixed(n:number):string};subtotal:{toFixed(n:number):string};
  /** orderInclude (order-shared.ts) doesn't filter cancelled lines at the query level;
   * shapeOrder() below filters them out of the customer-facing projection instead. */
  canceladaEn:Date|null;
  /** >0 once any part of this line has gone to the kitchen — editLine() then refuses
   * quantity changes ("añada una nueva línea"), though cancelLine() may still apply. */
  cantidadEnviada:{toFixed(n:number):string};
  ordenLineaModificadoresComoOrdenLinea:Array<{nombreSnapshot:string;cantidad:number;
   recargoUnitario:{toFixed(n:number):string}}>;
 }>;
}

@Injectable()
export class SelfServiceStore extends SelfServicePort{
 private serviceActorId:string|null=null;
 constructor(private readonly db:PrismaService,private readonly identity:IdentityRepository,
  private readonly orders:OrderService,private readonly catalog:CatalogService,
  private readonly realtime:RealtimePort){super();}

 private async serviceActor():Promise<Principal>{
  if(!this.serviceActorId){
   const u=await this.db.usuario.findUnique({where:{email:SERVICE_ACCOUNT_EMAIL}});
   if(!u||!u.activo)throw new ConflictException(
    'Cuenta de servicio de autoservicio no inicializada; ejecute el seed (npm run prisma:seed)');
   this.serviceActorId=u.id;
  }
  return {id:this.serviceActorId,email:SERVICE_ACCOUNT_EMAIL,nombre:'Autoservicio',
   sessionId:'self-service',debeCambiarContrasena:false,versionAutorizacion:0};
 }

 private async mesaSucursal(mesaId:string){
  const mesa=await this.db.mesa.findUnique({where:{id:mesaId},include:{sala:true}});
  if(!mesa)throw new NotFoundException('Mesa inexistente');
  return {mesa,sucursalId:mesa.sala.sucursalId};
 }

 async issueTableQr(u:Principal,mesaId:string,expiraEn?:string|null):Promise<TableQrIssued>{
  const {sucursalId}=await this.mesaSucursal(mesaId);
  if(!(await this.identity.capabilities(u.id,sucursalId)).includes('tables.manage'))
   throw new ForbiddenException('Permiso insuficiente para esta sucursal');
  const token=randomToken();
  const row=await this.db.$transaction(async tx=>{
   await tx.accesoMesaQR.updateMany({where:{mesaId,activo:true},data:{activo:false}});
   return tx.accesoMesaQR.create({data:{mesaId,hashToken:digest(token),activo:true,
    expiraEn:expiraEn?new Date(expiraEn):null}});
  });
  return {id:row.id,mesaId,token,url:`/t/${token}`,
   expiraEn:row.expiraEn?row.expiraEn.toISOString():null};
 }
 async listTableQr(u:Principal,mesaId:string):Promise<TableQrSummary[]>{
  const {sucursalId}=await this.mesaSucursal(mesaId);
  if(!(await this.identity.capabilities(u.id,sucursalId)).includes('tables.read'))
   throw new ForbiddenException('Permiso insuficiente para esta sucursal');
  const rows=await this.db.accesoMesaQR.findMany({where:{mesaId},orderBy:{creadoEn:'desc'}});
  return rows.map(r=>({id:r.id,mesaId:r.mesaId,activo:r.activo,
   expiraEn:r.expiraEn?r.expiraEn.toISOString():null,creadoEn:r.creadoEn.toISOString()}));
 }
 async revokeTableQr(u:Principal,id:string):Promise<void>{
  const row=await this.db.accesoMesaQR.findUnique({where:{id},include:{mesa:{include:{sala:true}}}});
  if(!row)throw new NotFoundException('Código QR inexistente');
  if(!(await this.identity.capabilities(u.id,row.mesa.sala.sucursalId)).includes('tables.manage'))
   throw new ForbiddenException('Permiso insuficiente para esta sucursal');
  await this.db.accesoMesaQR.update({where:{id},data:{activo:false}});
 }

 async access(token:string):Promise<SelfServiceAccess>{
  const hashToken=digest(token);
  const now=new Date();
  const acceso=await this.db.accesoMesaQR.findUnique({where:{hashToken},
   include:{mesa:{include:{sala:{include:{sucursal:{include:
    {configuracionSucursalesComoSucursal:true}}}}}}}});
  if(!acceso||!acceso.activo||(acceso.expiraEn&&acceso.expiraEn<=now))
   throw new UnauthorizedException('Código QR inválido o vencido');
  const {mesa}=acceso,{sala}=mesa,{sucursal}=sala;
  if(!mesa.activa||!sala.activa||!sucursal.activa)
   throw new ConflictException('Mesa o sucursal inactiva');
  const config=sucursal.configuracionSucursalesComoSucursal;
  if(!config?.permiteOrdenesQR)
   throw new ConflictException('Autoservicio por QR no habilitado para esta sucursal');
  const sessionToken=randomToken();
  const expiraEn=new Date(now.getTime()+SESSION_TTL_MS);
  const sesion=await this.db.sesionAutoservicio.create({data:{sucursalId:sucursal.id,
   accesoMesaQrId:acceso.id,hashSesion:digest(sessionToken),estado:'ACTIVA',expiraEn}});
  return {sessionToken,sesionId:sesion.id,expiraEn:expiraEn.toISOString(),
   sucursal:{id:sucursal.id,nombre:sucursal.nombre,moneda:config.moneda},
   mesa:{id:mesa.id,numero:mesa.numero,sala:sala.nombre}};
 }
 async resolveSession(hashSesion:string):Promise<SelfServiceSession|null>{
  const row=await this.db.sesionAutoservicio.findUnique({where:{hashSesion}});
  if(!row||row.estado!=='ACTIVA'||row.expiraEn<=new Date()||!row.accesoMesaQrId)return null;
  const acceso=await this.db.accesoMesaQR.findUnique({where:{id:row.accesoMesaQrId}});
  if(!acceso)return null;
  return {sesionId:row.id,sucursalId:row.sucursalId,mesaId:acceso.mesaId,ordenId:row.ordenId};
 }

 async menu(s:SelfServiceSession){
  // CatalogService.branchMenu is built for staff/POS and returns the raw
  // projection (Prisma relations, articuloInventario, etc.) — never pass that
  // through to an unauthenticated customer. Reshape to only what's needed to
  // render and order: name, price, image, modifier choices.
  const raw=await this.catalog.branchMenu(await this.serviceActor(),s.sucursalId) as RawBranchMenu;
  // branchMenu()'s own availability filter is commercial only (its `nota` field says so) — a
  // PREPARADO variant with no active+published Receta still comes back from it, and order.store.ts
  // (addItems()'s eventual call) rejects it with "Variante preparada sin receta publicada" the
  // moment the customer tries to add it. That error means nothing to a customer and there's no way
  // for them to act on it, so self-service must hide those items entirely rather than show
  // something the customer can tap but never actually order.
  const preparedIds=[...new Set(raw.menus.flatMap(m=>m.secciones.flatMap(sec=>sec.items
   .filter(item=>item.variante.producto.tipo==='PREPARADO').map(item=>item.variante.id))))];
  const recipes=preparedIds.length?await this.db.receta.findMany({where:{varianteId:{in:preparedIds},
   tipo:'VENTA',activa:true},include:{recetaVersionesComoReceta:{
    where:{activa:true,publicadaEn:{not:null}},take:1}}}):[];
  const readyIds=new Set(recipes.filter(r=>r.recetaVersionesComoReceta.length)
   .map(r=>r.varianteId).filter((id):id is string=>!!id));
  const ordenable=(item:RawMenuItem):boolean=>
   item.variante.producto.tipo!=='PREPARADO'||readyIds.has(item.variante.id);

  return {sucursalId:raw.sucursalId,menus:raw.menus.map(m=>({
   id:m.id,nombre:m.nombre,descripcion:m.descripcion,
   secciones:m.secciones.map(sec=>({id:sec.id,nombre:sec.nombre,orden:sec.orden,
    items:sec.items.filter(ordenable).map(item=>{
     const v=item.variante,p=v.producto;
     const imagenUrl=v.imagenPrincipalUrl??p.imagenPrincipalUrl??null;
     // Full gallery for the detail carousel: variant photos first (more specific),
     // then product photos, ordered, de-duplicated by mediaId, as plain URLs.
     const seen=new Set<string>();
     const imagenes=[...(v.imagenes??[]),...(p.imagenes??[])]
      .sort((a,b)=>a.orden-b.orden)
      .filter(ph=>!seen.has(ph.mediaId)&&(seen.add(ph.mediaId),true))
      .map(ph=>ph.url);
     if(imagenUrl&&!imagenes.includes(imagenUrl))imagenes.unshift(imagenUrl);
     return {id:item.id,varianteId:v.id,
      nombre:v.nombre&&v.nombre!=='Única'?`${p.nombre} — ${v.nombre}`:p.nombre,
      descripcion:p.descripcion,precio:item.precio,moneda:item.moneda,
      imagenUrl,imagenes,
      gruposModificadores:item.gruposModificadores.map(g=>({grupoId:g.grupoId,grupo:g.grupo,
       orden:g.orden,minimo:g.minimo,maximo:g.maximo,
       opciones:g.opciones.map(o=>({id:o.id,nombre:o.nombre,recargo:o.recargo}))}))};
    })})).filter(sec=>sec.items.length)
   })).filter(menuCard=>menuCard.secciones.length)};
 }
 private shapeOrder(ordenId:string,raw:RawOrden):SelfServiceCart{
  return {ordenId,orden:{id:raw.id,numero:raw.numero,estado:raw.estado,
   subtotal:raw.subtotal.toFixed(2),descuentoTotal:raw.descuentoTotal.toFixed(2),
   total:raw.total.toFixed(2),
   // orderInclude (order-shared.ts) doesn't filter cancelled lines at the query level,
   // so a customer-facing cart must drop them here explicitly.
   lineas:raw.ordenLineasComoOrden.filter(l=>!l.canceladaEn).map(l=>({id:l.id,nombre:l.nombreSnapshot,
    cantidad:l.cantidad.toFixed(2),precioUnitario:l.precioUnitario.toFixed(2),
    descuento:l.descuento.toFixed(2),subtotal:l.subtotal.toFixed(2),notasCocina:l.notasCocina,
    enviada:Number(l.cantidadEnviada.toFixed(3))>0,
    modificadores:l.ordenLineaModificadoresComoOrdenLinea.map(m=>({nombre:m.nombreSnapshot,
     cantidad:m.cantidad,recargoUnitario:m.recargoUnitario.toFixed(2)}))}))}};
 }
 async cart(s:SelfServiceSession):Promise<SelfServiceCart>{
  if(!s.ordenId)return {ordenId:null,orden:null};
  const raw=await this.orders.detail(await this.serviceActor(),s.ordenId) as RawOrden;
  return this.shapeOrder(s.ordenId,raw);
 }
 async addItems(s:SelfServiceSession,items:SelfServiceItemInput[]):Promise<SelfServiceCart>{
  const actor=await this.serviceActor();
  if(!s.ordenId){
   const created=await this.orders.create(actor,{sucursalId:s.sucursalId,modalidad:'MESA',
    origen:'QR',mesaId:s.mesaId,lineas:items,enviarCocina:false,claveOperacion:randomUUID()}) as RawOrden;
   await this.db.sesionAutoservicio.update({where:{id:s.sesionId},data:{ordenId:created.id}});
   return this.shapeOrder(created.id,created);
  }
  const updated=await this.orders.add(actor,s.ordenId,{lineas:items,enviarCocina:false,
   claveOperacion:randomUUID()}) as RawOrden;
  return this.shapeOrder(s.ordenId,updated);
 }
 async updateLineQuantity(s:SelfServiceSession,lineaId:string,cantidad:string):Promise<SelfServiceCart>{
  if(!s.ordenId)throw new BadRequestException('No hay un pedido activo');
  const raw=await this.orders.editLine(await this.serviceActor(),s.ordenId,lineaId,
   {cantidad,claveOperacion:randomUUID()}) as RawOrden;
  return this.shapeOrder(s.ordenId,raw);
 }
 async removeLine(s:SelfServiceSession,lineaId:string):Promise<SelfServiceCart>{
  if(!s.ordenId)throw new BadRequestException('No hay un pedido activo');
  const raw=await this.orders.cancelLine(await this.serviceActor(),s.ordenId,lineaId,
   {motivo:'Eliminado por el cliente desde autoservicio'}) as RawOrden;
  return this.shapeOrder(s.ordenId,raw);
 }
 async send(s:SelfServiceSession):Promise<SelfServiceCart>{
  if(!s.ordenId)throw new BadRequestException('No hay un pedido para enviar');
  const raw=await this.orders.send(await this.serviceActor(),s.ordenId,
   {claveOperacion:randomUUID()}) as RawOrden;
  return this.shapeOrder(s.ordenId,raw);
 }
 async callWaiter(s:SelfServiceSession):Promise<void>{
  // Best-effort nudge: look up the table's display info for the toast, but never let a
  // lookup miss turn into an error the customer sees — the button's job is just "ping staff".
  const mesa=await this.db.mesa.findUnique({where:{id:s.mesaId},include:{sala:true}});
  this.realtime.emit(s.sucursalId,'TABLE_HELP_REQUESTED',{
   mesaId:s.mesaId,mesaNumero:mesa?.numero??null,sala:mesa?.sala.nombre??null,
   // Lets the staff toast deep-link straight to this table's open order (if it has one
   // yet) instead of a generic table-admin screen that has nothing to act on.
   ordenId:s.ordenId});
 }
 async closeSession(s:SelfServiceSession):Promise<void>{
  await this.db.sesionAutoservicio.updateMany({where:{id:s.sesionId,estado:'ACTIVA'},
   data:{estado:'FINALIZADA'}});
 }
}
