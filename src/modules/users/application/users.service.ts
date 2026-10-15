import {randomBytes} from 'node:crypto';
import {
 BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException
} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {IdentityRepository} from '../../auth/application/ports/identity.repository.js';
import {PasswordHasher} from '../../auth/application/ports/crypto.ports.js';
import {UsersRepositoryPort} from './ports/users.repository.port.js';
import {UserActivityPort,type ActivityItem} from './ports/user-activity.port.js';
import {AvatarResolver} from './avatar-resolver.service.js';
import {preventSelfAdministrativeAction,normalizeEmail,normalizeRoleCode} from '../domain/user-policy.js';
import type {RoleScope,UserRecord} from '../domain/user.types.js';

interface Pagination {page:number;limit:number}
const meta=(page:number,limit:number,total:number)=>({page,limit,total,totalPages:Math.ceil(total/limit)});

@Injectable()
export class UsersService {
 constructor(
  private readonly repo:UsersRepositoryPort,
  private readonly identities:IdentityRepository,
  private readonly passwords:PasswordHasher,
  private readonly avatars:AvatarResolver,
  private readonly activity:UserActivityPort
 ){}
 private async globalAdmin(actor:Principal):Promise<void>{
  if(!await this.repo.isGlobalSuperAdmin(actor.id))throw new ForbiddenException('Solo SUPER_ADMIN global puede administrar usuarios');
 }
 private async readScope(actor:Principal,branch:string|null){
  const global=await this.identities.capabilities(actor.id,null);
  if(global.includes('users.read'))return {global:true,branch};
  if(!branch)throw new ForbiddenException('Seleccione una sucursal autorizada');
  const permissions=await this.identities.capabilities(actor.id,branch);
  if(!permissions.includes('users.read'))throw new ForbiddenException('Sin permiso para consultar personal');
  return {global:false,branch};
 }
 private async requirePermission(actor:Principal,code:string,branch:string|null){
  const perms=await this.identities.capabilities(actor.id,branch);
  if(!perms.includes(code))throw new ForbiddenException('Permiso insuficiente');
 }
 private async visibleUser(actor:Principal,id:string,branch:string|null):Promise<UserRecord>{
  const scope=await this.readScope(actor,branch);
  const user=await this.repo.getUser(id);
  if(!user||(!scope.global&&!user.assignments.some(x=>x.sucursalId===branch)))
   throw new NotFoundException('Usuario no encontrado');
  return scope.global?user:{...user,assignments:user.assignments.filter(a=>a.sucursalId===branch)};
 }
 private async response(user:UserRecord,branchOnly?:string){
  if(branchOnly)user={...user,assignments:user.assignments.filter(a=>a.sucursalId===branchOnly)};
  return {
   id:user.id,
   profile:{
    nombre:user.nombre,apellidos:user.perfil?.apellidos??null,
    nombreCompleto:[user.nombre,user.perfil?.apellidos].filter(Boolean).join(' '),
    email:user.email,telefono:user.perfil?.telefono??null,
    idioma:user.perfil?.idioma??'es-GT',zonaHoraria:user.perfil?.zonaHoraria??'America/Guatemala',
    avatar:{mediaId:user.perfil?.avatarMediaId??null,url:await this.avatars.resolve(user.perfil?.avatarMediaId)}
   },
   account:{activo:user.activo,debeCambiarContrasena:user.debeCambiarContrasena,
    ultimoAccesoEn:user.ultimoAccesoEn,creadoEn:user.creadoEn,actualizadoEn:user.actualizadoEn},
   access:{assignments:user.assignments,branches:[...new Map(user.assignments.filter(a=>a.sucursalId).map(a=>[
    a.sucursalId!,{id:a.sucursalId,nombre:a.sucursalNombre}
   ])).values()]}
  };
 }

 async me(actor:Principal){
  const user=await this.repo.getUser(actor.id);
  if(!user||!user.activo)throw new NotFoundException('Usuario no encontrado');
  return this.response(user);
 }
 async updateMyProfile(actor:Principal,input:{apellidos?:string|null;telefono?:string|null;idioma?:string;zonaHoraria?:string}){
  await this.repo.updateOwnProfile(actor.id,input);
  return this.me(actor);
 }
 async updateMyAvatar(actor:Principal,mediaId:string|null){
  await this.repo.setOwnAvatar(actor.id,mediaId);
  return this.me(actor);
 }
 async list(actor:Principal,input:Pagination&{search?:string;activo?:boolean;rolId?:string;sucursalId?:string}){
  const branch=input.sucursalId??null,scope=await this.readScope(actor,branch);
  const result=await this.repo.listUsers({search:input.search,activo:input.activo,rolId:input.rolId,
   sucursalId:scope.global?branch??undefined:branch!,skip:(input.page-1)*input.limit,take:input.limit});
  return {data:await Promise.all(result.data.map(u=>this.response(u,scope.global?undefined:branch!))),
   meta:meta(input.page,input.limit,result.total)};
 }
 async detail(actor:Principal,id:string,branch:string|null){
  return this.response(await this.visibleUser(actor,id,branch));
 }
 async options(actor:Principal,input:{search?:string;sucursalId:string|null;purpose?:string;cursor?:string;limit:number}){
  const scope=await this.readScope(actor,input.sucursalId);
  if(!scope.global&&!input.sucursalId)throw new ForbiddenException();
  const result=await this.repo.options(input);
  return {data:await Promise.all(result.data.map(async x=>({...x,avatarUrl:await this.avatars.resolve(x.avatarMediaId)}))),
   meta:{hasMore:!!result.nextCursor,nextCursor:result.nextCursor}};
 }
 async create(actor:Principal,input:{email:string;nombre:string;apellidos?:string;telefono?:string;
  temporalPassword?:string;assignments?:{rolId:string;sucursalId:string|null}[]}){
  await this.globalAdmin(actor);
  const temporaryPassword=input.temporalPassword??randomBytes(18).toString('base64url');
  const userId=await this.repo.create({
   actorId:actor.id,email:normalizeEmail(input.email),nombre:input.nombre.trim(),
   hash:await this.passwords.hash(temporaryPassword),
   apellidos:input.apellidos?.trim(),telefono:input.telefono?.trim(),rolIds:input.assignments??[]
  });
  return {user:await this.response((await this.repo.getUser(userId))!),
   temporaryPassword,requiresPasswordChange:true};
 }
 async update(actor:Principal,id:string,input:{email?:string;nombre?:string;apellidos?:string|null;
  telefono?:string|null;idioma?:string;zonaHoraria?:string}){
  await this.globalAdmin(actor);
  await this.repo.update({actorId:actor.id,userId:id,
   ...input,email:input.email?normalizeEmail(input.email):undefined,
   nombre:input.nombre?.trim()});
  return this.response((await this.repo.getUser(id))!);
 }
 async changeStatus(actor:Principal,id:string,activo:boolean,motivo:string){
  await this.globalAdmin(actor);
  preventSelfAdministrativeAction(actor.id,id);
  if(!activo&&await this.repo.hasOpenOperations(id))
   throw new ConflictException('El empleado tiene caja, reparto o liquidaciones pendientes de cierre');
  await this.repo.setActive({actorId:actor.id,userId:id,activo,motivo});
  return {id,activo};
 }
 async resetPassword(actor:Principal,id:string,motivo:string){
  await this.globalAdmin(actor);
  preventSelfAdministrativeAction(actor.id,id);
  const temporaryPassword=randomBytes(18).toString('base64url');
  await this.repo.resetPassword({actorId:actor.id,userId:id,
   hash:await this.passwords.hash(temporaryPassword),motivo});
  return {id,temporaryPassword,requiresPasswordChange:true,sessionsRevoked:true};
 }
 async sessions(actor:Principal,id:string,input:Pagination){
  await this.globalAdmin(actor);
  if(!await this.repo.getUser(id))throw new NotFoundException('Usuario no encontrado');
  const result=await this.repo.sessions(id,input.page,input.limit);
  return {data:result.data.map(s=>({...s,active:!s.revocadaEn&&s.expiraEn>new Date()})),
   meta:meta(input.page,input.limit,result.total)};
 }
 async revokeSessions(actor:Principal,id:string,motivo:string,sessionId?:string){
  await this.globalAdmin(actor);
  preventSelfAdministrativeAction(actor.id,id);
  if(!await this.repo.getUser(id))throw new NotFoundException('Usuario no encontrado');
  const count=await this.repo.revokeSessions({actorId:actor.id,userId:id,sessionId,motivo});
  return {id,revoked:count};
 }
 async avatar(actor:Principal,id:string,mediaId:string|null){
  await this.globalAdmin(actor);
  await this.repo.setAvatar({actorId:actor.id,userId:id,mediaId});
  return this.response((await this.repo.getUser(id))!);
 }
 async assignments(actor:Principal,id:string,assignments:{rolId:string;sucursalId:string|null}[]){
  await this.globalAdmin(actor);
  preventSelfAdministrativeAction(actor.id,id);
  await this.repo.replaceAssignments({actorId:actor.id,userId:id,assignments});
  return this.response((await this.repo.getUser(id))!);
 }
 async audit(actor:Principal,id:string,branch:string|null,input:Pagination){
  await this.requirePermission(actor,'users.audit.read',branch);
  await this.visibleUser(actor,id,branch);
  const {data,total}=await this.repo.getAudit({userId:id,skip:(input.page-1)*input.limit,take:input.limit});
  return {data,meta:meta(input.page,input.limit,total)};
 }
 async roles(actor:Principal,input:Pagination&{search?:string;activo?:boolean}){
  await this.globalAdmin(actor);
  const {data,total}=await this.repo.listRoles({
   skip:(input.page-1)*input.limit,take:input.limit,search:input.search,activo:input.activo
  });
  return {data,meta:meta(input.page,input.limit,total)};
 }
 async role(actor:Principal,id:string){
  await this.globalAdmin(actor);
  const role=await this.repo.roleById(id);
  if(!role)throw new NotFoundException('Rol no encontrado');
  return role;
 }
 async roleOptions(actor:Principal,input:Pagination&{search?:string}){
  await this.globalAdmin(actor);
  const result=await this.repo.listRoles({
   activo:true,search:input.search,skip:(input.page-1)*input.limit,take:input.limit
  });
  return {data:result.data.map(r=>({
   id:r.id,label:r.nombre,codigo:r.codigo,alcance:r.alcance
  })),meta:meta(input.page,input.limit,result.total)};
 }
 async permissions(actor:Principal){
  await this.globalAdmin(actor);
  const items=await this.repo.listPermissions();
  const groups=new Map<string,typeof items>();
  for(const item of items)groups.set(item.modulo,[...(groups.get(item.modulo)??[]),item]);
  return {data:[...groups].map(([module,permissions])=>({module,permissions}))};
 }
 async createRole(actor:Principal,input:{codigo:string;nombre:string;descripcion?:string;alcance:RoleScope}){
  await this.globalAdmin(actor);
  const id=await this.repo.createRole({actorId:actor.id,codigo:normalizeRoleCode(input.codigo),
   nombre:input.nombre.trim(),descripcion:input.descripcion?.trim(),alcance:input.alcance});
  return this.repo.roleById(id);
 }
 async updateRole(actor:Principal,id:string,input:{nombre?:string;descripcion?:string|null;activo?:boolean}){
  await this.globalAdmin(actor);
  await this.repo.updateRole({actorId:actor.id,roleId:id,...input});
  return this.repo.roleById(id);
 }
 async replaceRolePermissions(actor:Principal,id:string,permisos:string[]){
  await this.globalAdmin(actor);
  if(new Set(permisos).size!==permisos.length)throw new BadRequestException('Permisos duplicados');
  await this.repo.replaceRolePermissions({actorId:actor.id,roleId:id,permisos});
  return this.repo.roleById(id);
 }
 private dateRange(from?:string,to?:string,branch?:string){
  const end=to?new Date(to+'T00:00:00.000Z'):new Date();
  const start=from?new Date(from+'T00:00:00.000Z'):new Date(end.getTime()-30*86400000);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start>=end||
   end.getTime()-start.getTime()>366*86400000)throw new BadRequestException('Rango de fechas inválido (máximo 366 días)');
  return {from:start,to:end,sucursalId:branch??null};
 }
 async overview(actor:Principal,id:string,input:{from?:string;to?:string;sucursalId?:string}){
  await this.requirePermission(actor,'users.reports.read',input.sucursalId??null);
  await this.visibleUser(actor,id,input.sucursalId??null);
  return this.activity.overview(id,this.dateRange(input.from,input.to,input.sucursalId));
 }
 async activityList(actor:Principal,id:string,input:Pagination&{from?:string;to?:string;sucursalId?:string;kind?:ActivityItem['kind']}){
  await this.requirePermission(actor,'users.reports.read',input.sucursalId??null);
  await this.visibleUser(actor,id,input.sucursalId??null);
  return this.activity.activity(id,this.dateRange(input.from,input.to,input.sucursalId),input);
 }
 async report(actor:Principal,input:Pagination&{from?:string;to?:string;sucursalId?:string}){
  await this.globalAdmin(actor);
  return this.activity.report(this.dateRange(input.from,input.to,input.sucursalId),input);
 }
}
