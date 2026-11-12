import {randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,
 NotFoundException,UnauthorizedException} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository} from '../../../auth/application/ports/identity.repository.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {OrderService} from '../../../orders/application/order.service.js';
import {CatalogService} from '../../../catalog/application/catalog.service.js';
import {SelfServicePort} from '../../application/ports/self-service.repository.js';
import type {SelfServiceAccess,SelfServiceItemInput,SelfServiceSession,
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
interface RawBranchMenu{sucursalId:string;menus:Array<{id:string;nombre:string;descripcion:string|null;
 secciones:Array<{id:string;nombre:string;orden:number;items:Array<{id:string;precio:string;moneda:string;
  variante:{id:string;nombre:string;imagenPrincipalUrl:string|null;
   producto:{nombre:string;descripcion:string|null;imagenPrincipalUrl:string|null}};
  gruposModificadores:Array<{grupoId:string;grupo:string;orden:number;minimo:number;maximo:number;
   opciones:Array<{id:string;nombre:string;recargo:string}>}>;
 }>}>}>}

@Injectable()
export class SelfServiceStore extends SelfServicePort{
 private serviceActorId:string|null=null;
 constructor(private readonly db:PrismaService,private readonly identity:IdentityRepository,
  private readonly orders:OrderService,private readonly catalog:CatalogService){super();}

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
  return {sucursalId:raw.sucursalId,menus:raw.menus.map(m=>({
   id:m.id,nombre:m.nombre,descripcion:m.descripcion,
   secciones:m.secciones.map(sec=>({id:sec.id,nombre:sec.nombre,orden:sec.orden,
    items:sec.items.map(item=>{
     const v=item.variante,p=v.producto;
     return {id:item.id,varianteId:v.id,
      nombre:v.nombre&&v.nombre!=='Única'?`${p.nombre} — ${v.nombre}`:p.nombre,
      descripcion:p.descripcion,precio:item.precio,moneda:item.moneda,
      imagenUrl:v.imagenPrincipalUrl??p.imagenPrincipalUrl??null,
      gruposModificadores:item.gruposModificadores.map(g=>({grupoId:g.grupoId,grupo:g.grupo,
       orden:g.orden,minimo:g.minimo,maximo:g.maximo,
       opciones:g.opciones.map(o=>({id:o.id,nombre:o.nombre,recargo:o.recargo}))}))};
    })}))}))};
 }
 async cart(s:SelfServiceSession){
  if(!s.ordenId)return {ordenId:null,orden:null};
  return {ordenId:s.ordenId,orden:await this.orders.detail(await this.serviceActor(),s.ordenId)};
 }
 async addItems(s:SelfServiceSession,items:SelfServiceItemInput[]){
  const actor=await this.serviceActor();
  if(!s.ordenId){
   const created=await this.orders.create(actor,{sucursalId:s.sucursalId,modalidad:'MESA',
    origen:'QR',mesaId:s.mesaId,lineas:items,enviarCocina:false,claveOperacion:randomUUID()});
   await this.db.sesionAutoservicio.update({where:{id:s.sesionId},data:{ordenId:created.id}});
   return {session:{...s,ordenId:created.id},orden:created};
  }
  const updated=await this.orders.add(actor,s.ordenId,{lineas:items,enviarCocina:false,
   claveOperacion:randomUUID()});
  return {session:s,orden:updated};
 }
 async send(s:SelfServiceSession){
  if(!s.ordenId)throw new BadRequestException('No hay un pedido para enviar');
  return this.orders.send(await this.serviceActor(),s.ordenId,{claveOperacion:randomUUID()});
 }
 async closeSession(s:SelfServiceSession):Promise<void>{
  await this.db.sesionAutoservicio.updateMany({where:{id:s.sesionId,estado:'ACTIVA'},
   data:{estado:'FINALIZADA'}});
 }
}
