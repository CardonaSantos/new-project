import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '../../../../generated/prisma/client.js';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {UsersRepositoryPort} from '../../application/ports/users.repository.port.js';
import type {UserFilters,UserRecord,RoleScope} from '../../domain/user.types.js';
import {preventLastSuperAdminRemoval} from '../../domain/user-policy.js';
import {UsersMapper,userInclude} from './users.mapper.js';

type Client=Prisma.TransactionClient;
const roleInclude={
 rolPermisosComoRol:{include:{permiso:true}},
 _count:{select:{usuarioRolesComoRol:true}}
} as const;
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};

function normalizeAssignments(items:{rolId:string;sucursalId:string|null}[]){
 const keys=new Set<string>();
 for(const x of items){
  const key=x.rolId+'|'+(x.sucursalId??'GLOBAL');
  if(keys.has(key))throw new ConflictException('Asignación duplicada');
  keys.add(key);
 }
 return items;
}
async function verifyAssignments(tx:Client,items:{rolId:string;sucursalId:string|null}[]){
 for(const item of normalizeAssignments(items)){
  const role=await tx.rol.findUnique({where:{id:item.rolId}});
  if(!role||!role.activo)throw new NotFoundException('Rol no disponible');
  if(role.alcance==='GLOBAL'&&item.sucursalId!==null||
     role.alcance==='SUCURSAL'&&!item.sucursalId)
    throw new ConflictException('El alcance de rol y sucursal no coincide');
  if(item.sucursalId){
   const branch=await tx.sucursal.findUnique({where:{id:item.sucursalId}});
   if(!branch?.activa)throw new ConflictException('La sucursal no está activa');
  }
 }
}
async function assertPrivilegedActor(tx:Client,actorId:string):Promise<void>{
 const admin=await tx.usuarioRol.findFirst({where:{
  usuarioId:actorId,sucursalId:null,usuario:{activo:true},
  rol:{codigo:'SUPER_ADMIN',activo:true,alcance:'GLOBAL'}
 }});
 if(!admin)throw new ForbiddenException('La sesión no conserva privilegios de SUPER_ADMIN');
}
function activeAdminCount(tx:Client){
 return tx.usuario.count({where:{activo:true,usuarioRolesComoUsuario:{some:{
  sucursalId:null,rol:{codigo:'SUPER_ADMIN',activo:true,alcance:'GLOBAL'}
 }}}});
}
function audit(tx:Client,actorId:string,action:string,entity:string,entityId:string,
 before?:unknown,after?:unknown,reason?:string){
 return tx.eventoAuditoria.create({data:{
  usuarioId:actorId,accion:action,entidad:entity,entidadId:entityId,
  antes:before==null?undefined:before as Prisma.InputJsonValue,
  despues:after==null?undefined:after as Prisma.InputJsonValue,
  motivo:reason
 }});
}

@Injectable()
export class PrismaUsersRepository extends UsersRepositoryPort {
 constructor(private readonly db:PrismaService){super();}
 async getUser(id:string):Promise<UserRecord|null>{
  const row=await this.db.usuario.findUnique({where:{id},include:userInclude});
  return row?UsersMapper.user(row):null;
 }
 async listUsers(f:UserFilters){
  const where:Prisma.UsuarioWhereInput={
   ...(f.search?{OR:[
    {nombre:{contains:f.search,mode:'insensitive'}},
    {email:{contains:f.search,mode:'insensitive'}},
    {perfil:{is:{apellidos:{contains:f.search,mode:'insensitive'}}}}
   ]}:{}),
   ...(f.activo===undefined?{}:{activo:f.activo}),
   ...(f.sucursalId||f.rolId?{usuarioRolesComoUsuario:{some:{
    ...(f.sucursalId?{sucursalId:f.sucursalId}:{}),
    ...(f.rolId?{rolId:f.rolId}:{})
   }}}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.usuario.findMany({where,include:userInclude,
    orderBy:[{creadoEn:'desc'},{id:'desc'}],skip:f.skip,take:f.take}),
   this.db.usuario.count({where})
  ]);
  return {data:rows.map(UsersMapper.user),total};
 }
 async options(f:{search?:string;sucursalId:string|null;purpose?:string;cursor?:string;limit:number}){
  const roleWhere:Prisma.RolWhereInput={
   activo:true,
   ...(!f.sucursalId?{alcance:'GLOBAL' as const}:{}),
   ...(f.purpose?{rolPermisosComoRol:{some:{permiso:{codigo:f.purpose}}}}:{})
  };
  const where:Prisma.UsuarioWhereInput={
   activo:true,
   ...(f.cursor?{id:{gt:f.cursor}}:{}),
   ...(f.search?{OR:[
    {nombre:{contains:f.search,mode:'insensitive'}},
    {email:{contains:f.search,mode:'insensitive'}},
    {perfil:{is:{apellidos:{contains:f.search,mode:'insensitive'}}}}
   ]}:{}),
   usuarioRolesComoUsuario:{some:{sucursalId:f.sucursalId,rol:roleWhere}}
  };
  const rows=await this.db.usuario.findMany({
   where,include:userInclude,orderBy:{id:'asc'},take:f.limit+1
  });
  const more=rows.length>f.limit;
  const sliced=more?rows.slice(0,f.limit):rows;
  return {data:sliced.map(row=>UsersMapper.option(row,f.sucursalId)),
   nextCursor:more?sliced[sliced.length-1].id:null};
 }
 async create(input:{actorId:string;email:string;nombre:string;hash:string;apellidos?:string;
  telefono?:string;rolIds:{rolId:string;sucursalId:string|null}[]}):Promise<string>{
  return this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   if(await tx.usuario.findUnique({where:{email:input.email}}))throw new ConflictException('Correo registrado');
   await verifyAssignments(tx,input.rolIds);
   const user=await tx.usuario.create({data:{
    email:input.email,nombre:input.nombre,hashContrasena:input.hash,debeCambiarContrasena:true,
    perfil:{create:{apellidos:input.apellidos,telefono:input.telefono}},
    usuarioRolesComoUsuario:{create:input.rolIds.map(r=>({rolId:r.rolId,sucursalId:r.sucursalId}))}
   }});
   await audit(tx,input.actorId,'USER_CREATED','Usuario',user.id,undefined,
    {email:user.email,nombre:user.nombre,rolIds:input.rolIds});
   return user.id;
  },serializable);
 }
 async update(input:{actorId:string;userId:string;email?:string;nombre?:string;apellidos?:string|null;
  telefono?:string|null;idioma?:string;zonaHoraria?:string}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const before=await tx.usuario.findUnique({where:{id:input.userId},include:{perfil:true}});
   if(!before)throw new NotFoundException('Usuario no encontrado');
   const updated=await tx.usuario.update({where:{id:input.userId},data:{
    email:input.email,nombre:input.nombre,
    perfil:{upsert:{create:{
     apellidos:input.apellidos??undefined,telefono:input.telefono??undefined,
     idioma:input.idioma,zonaHoraria:input.zonaHoraria
    },update:{
     apellidos:input.apellidos,telefono:input.telefono,
     idioma:input.idioma,zonaHoraria:input.zonaHoraria
    }}}
   }});
   if(input.email&&input.email!==before.email){
    await tx.usuario.update({where:{id:input.userId},data:{versionAutorizacion:{increment:1}}});
    await tx.sesionUsuario.updateMany({where:{usuarioId:input.userId,revocadaEn:null},
     data:{revocadaEn:new Date(),revocacionMotivo:'ADMIN_EMAIL_CHANGED'}});
   }
   await audit(tx,input.actorId,'USER_UPDATED','Usuario',input.userId,
    {email:before.email,nombre:before.nombre},
    {email:updated.email,nombre:updated.nombre,perfilActualizado:true});
  },serializable);
 }
 async setActive(input:{actorId:string;userId:string;activo:boolean;motivo:string}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const user=await tx.usuario.findUnique({where:{id:input.userId},include:{usuarioRolesComoUsuario:{include:{rol:true}}}});
   if(!user)throw new NotFoundException('Usuario no encontrado');
   if(user.activo===input.activo)return;
   const isAdmin=user.usuarioRolesComoUsuario.some(r=>r.rol.codigo==='SUPER_ADMIN'&&r.rol.activo&&r.rol.alcance==='GLOBAL'&&r.sucursalId===null);
   if(!input.activo&&isAdmin)preventLastSuperAdminRemoval(true,false,await activeAdminCount(tx));
   await tx.usuario.update({where:{id:user.id},data:{activo:input.activo,versionAutorizacion:{increment:1}}});
   if(!input.activo)await tx.sesionUsuario.updateMany({where:{usuarioId:user.id,revocadaEn:null},
    data:{revocadaEn:new Date(),revocacionMotivo:'ADMIN_DEACTIVATED'}});
   await audit(tx,input.actorId,input.activo?'USER_ACTIVATED':'USER_DEACTIVATED',
    'Usuario',user.id,{activo:user.activo},{activo:input.activo},input.motivo);
  },serializable);
 }
 async resetPassword(input:{actorId:string;userId:string;hash:string;motivo:string}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const user=await tx.usuario.findUnique({where:{id:input.userId}});
   if(!user)throw new NotFoundException('Usuario no encontrado');
   await tx.usuario.update({where:{id:input.userId},data:{
    hashContrasena:input.hash,debeCambiarContrasena:true,versionAutorizacion:{increment:1}
   }});
   await tx.sesionUsuario.updateMany({where:{usuarioId:input.userId,revocadaEn:null},
    data:{revocadaEn:new Date(),revocacionMotivo:'ADMIN_PASSWORD_RESET'}});
   await audit(tx,input.actorId,'USER_PASSWORD_RESET','Usuario',input.userId,
    undefined,{sessionsRevoked:true},input.motivo);
  },serializable);
 }
 async revokeSessions(input:{actorId:string;userId:string;sessionId?:string;motivo:string}):Promise<number>{
  return this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const changed=await tx.sesionUsuario.updateMany({where:{
    usuarioId:input.userId,revocadaEn:null,...(input.sessionId?{id:input.sessionId}:{})
   },data:{revocadaEn:new Date(),revocacionMotivo:'ADMIN_REVOKED'}});
   await audit(tx,input.actorId,'USER_SESSIONS_REVOKED','Usuario',input.userId,
    undefined,{sessionId:input.sessionId??null,count:changed.count},input.motivo);
   return changed.count;
  });
 }
 async sessions(userId:string,page:number,limit:number){
  const [rows,total]=await this.db.$transaction([
   this.db.sesionUsuario.findMany({where:{usuarioId:userId},include:{dispositivo:true},
    orderBy:[{creadaEn:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit}),
   this.db.sesionUsuario.count({where:{usuarioId:userId}})
  ]);
  return {data:rows.map(s=>({id:s.id,dispositivoId:s.dispositivoId,dispositivoNombre:s.dispositivo?.nombre??null,
   userAgent:s.userAgent,ipCreacion:s.ipCreacion,creadaEn:s.creadaEn,ultimoUsoEn:s.ultimoUsoEn,
   expiraEn:s.expiraEn,revocadaEn:s.revocadaEn,revocacionMotivo:s.revocacionMotivo})),total};
 }
 async setAvatar(input:{actorId:string;userId:string;mediaId:string|null}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   if(input.mediaId){
    const asset=await tx.media.findUnique({where:{id:input.mediaId}});
    if(!asset||asset.tipo!=='IMAGEN'||asset.contexto!=='PERFIL'||!asset.confirmadaEn||asset.eliminadaEn)
     throw new ConflictException('Imagen de perfil no válida o pendiente');
    if(asset.subidaPorId!==input.actorId)
     throw new ForbiddenException('La imagen debe haber sido subida por el administrador');
   }
   const user=await tx.usuario.findUnique({where:{id:input.userId},include:{perfil:true}});
   if(!user)throw new NotFoundException('Usuario no encontrado');
   await tx.perfilUsuario.upsert({where:{usuarioId:input.userId},create:{usuarioId:input.userId,
    avatarMediaId:input.mediaId},update:{avatarMediaId:input.mediaId}});
   await audit(tx,input.actorId,'USER_AVATAR_UPDATED','Usuario',input.userId,
    {mediaId:user.perfil?.avatarMediaId??null},{mediaId:input.mediaId});
  });
 }
 async replaceAssignments(input:{actorId:string;userId:string;assignments:{rolId:string;sucursalId:string|null}[]}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const user=await tx.usuario.findUnique({where:{id:input.userId}});
   if(!user)throw new NotFoundException('Usuario no encontrado');
   await verifyAssignments(tx,input.assignments);
   const before=await tx.usuarioRol.findMany({where:{usuarioId:user.id},include:{rol:true}});
   const wasAdmin=user.activo&&before.some(r=>r.rol.codigo==='SUPER_ADMIN'&&r.rol.activo&&r.rol.alcance==='GLOBAL'&&r.sucursalId===null);
   const superAdmin=await tx.rol.findUnique({where:{codigo:'SUPER_ADMIN'}});
   const remainsAdmin=user.activo&&!!superAdmin&&superAdmin.activo&&
    input.assignments.some(r=>r.rolId===superAdmin.id&&r.sucursalId===null);
   if(wasAdmin&&!remainsAdmin)preventLastSuperAdminRemoval(true,false,await activeAdminCount(tx));
   await tx.usuarioRol.deleteMany({where:{usuarioId:user.id}});
   if(input.assignments.length)await tx.usuarioRol.createMany({data:input.assignments.map(a=>({
    usuarioId:user.id,rolId:a.rolId,sucursalId:a.sucursalId
   }))});
   await tx.usuario.update({where:{id:user.id},data:{versionAutorizacion:{increment:1}}});
   await tx.sesionUsuario.updateMany({where:{usuarioId:user.id,revocadaEn:null},
    data:{revocadaEn:new Date(),revocacionMotivo:'ADMIN_ROLE_CHANGE'}});
   await audit(tx,input.actorId,'USER_ROLES_REPLACED','Usuario',user.id,
    {assignments:before.map(x=>({rolId:x.rolId,sucursalId:x.sucursalId}))},
    {assignments:input.assignments});
  },serializable);
 }
 async countActiveSuperAdmins():Promise<number>{return activeAdminCount(this.db);}
 async isGlobalSuperAdmin(userId:string):Promise<boolean>{
  return !!await this.db.usuarioRol.findFirst({where:{usuarioId:userId,sucursalId:null,
   usuario:{activo:true},rol:{codigo:'SUPER_ADMIN',alcance:'GLOBAL',activo:true}}});
 }
 async userHasGlobalSuperAdmin(userId:string):Promise<boolean>{
  return this.isGlobalSuperAdmin(userId);
 }
 async roleById(id:string){
  const row=await this.db.rol.findUnique({where:{id},include:roleInclude});
  return row?UsersMapper.role(row):null;
 }
 async listRoles(f:{search?:string;activo?:boolean;skip:number;take:number}){
  const where:Prisma.RolWhereInput={
   ...(f.activo===undefined?{}:{activo:f.activo}),
   ...(f.search?{OR:[{nombre:{contains:f.search,mode:'insensitive'}},
    {codigo:{contains:f.search,mode:'insensitive'}}]}:{})
  };
  const [rows,total]=await this.db.$transaction([
   this.db.rol.findMany({where,include:roleInclude,orderBy:{codigo:'asc'},skip:f.skip,take:f.take}),
   this.db.rol.count({where})
  ]);
  return {data:rows.map(UsersMapper.role),total};
 }
 listPermissions(){
  return this.db.permiso.findMany({orderBy:[{modulo:'asc'},{codigo:'asc'}]});
 }
 async createRole(input:{actorId:string;codigo:string;nombre:string;descripcion?:string;alcance:RoleScope}):Promise<string>{
  return this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   if(input.codigo==='SUPER_ADMIN')throw new ForbiddenException('El rol SUPER_ADMIN está reservado');
   if(await tx.rol.findUnique({where:{codigo:input.codigo}}))throw new ConflictException('Código de rol registrado');
   const role=await tx.rol.create({data:{codigo:input.codigo,nombre:input.nombre,
    descripcion:input.descripcion,alcance:input.alcance}});
   await audit(tx,input.actorId,'ROLE_CREATED','Rol',role.id,undefined,{codigo:role.codigo,alcance:role.alcance});
   return role.id;
  });
 }
 async updateRole(input:{actorId:string;roleId:string;nombre?:string;descripcion?:string|null;activo?:boolean}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const role=await tx.rol.findUnique({where:{id:input.roleId}});
   if(!role)throw new NotFoundException('Rol no encontrado');
   if(role.codigo==='SUPER_ADMIN')throw new ForbiddenException('SUPER_ADMIN es un rol protegido');
   const updated=await tx.rol.update({where:{id:role.id},data:{
    nombre:input.nombre,descripcion:input.descripcion,activo:input.activo,version:{increment:1}
   }});
   const users=await tx.usuarioRol.findMany({where:{rolId:role.id},select:{usuarioId:true}});
   if(users.length){
    const ids=[...new Set(users.map(x=>x.usuarioId))];
    await tx.usuario.updateMany({where:{id:{in:ids}},data:{versionAutorizacion:{increment:1}}});
    await tx.sesionUsuario.updateMany({where:{usuarioId:{in:ids},revocadaEn:null},
     data:{revocadaEn:new Date(),revocacionMotivo:'ROLE_UPDATED'}});
   }
   await audit(tx,input.actorId,'ROLE_UPDATED','Rol',role.id,
    {nombre:role.nombre,activo:role.activo},{nombre:updated.nombre,activo:updated.activo});
  },serializable);
 }
 async replaceRolePermissions(input:{actorId:string;roleId:string;permisos:string[]}):Promise<void>{
  await this.db.$transaction(async tx=>{
   await assertPrivilegedActor(tx,input.actorId);
   const role=await tx.rol.findUnique({where:{id:input.roleId},include:{rolPermisosComoRol:{include:{permiso:true}}}});
   if(!role)throw new NotFoundException('Rol no encontrado');
   if(role.codigo==='SUPER_ADMIN')throw new ForbiddenException('No se editan los permisos del SUPER_ADMIN');
   const found=await tx.permiso.findMany({where:{codigo:{in:input.permisos}}});
   if(found.length!==input.permisos.length)throw new ConflictException('Uno o más permisos son desconocidos');
   const before=role.rolPermisosComoRol.map(x=>x.permiso.codigo);
   await tx.rolPermiso.deleteMany({where:{rolId:role.id}});
   if(found.length)await tx.rolPermiso.createMany({data:found.map(x=>({rolId:role.id,permisoId:x.id}))});
   await tx.rol.update({where:{id:role.id},data:{version:{increment:1}}});
   const users=await tx.usuarioRol.findMany({where:{rolId:role.id},select:{usuarioId:true}});
   if(users.length){
    const ids=[...new Set(users.map(x=>x.usuarioId))];
    await tx.usuario.updateMany({where:{id:{in:ids}},data:{versionAutorizacion:{increment:1}}});
    await tx.sesionUsuario.updateMany({where:{usuarioId:{in:ids},revocadaEn:null},
     data:{revocadaEn:new Date(),revocacionMotivo:'ROLE_PERMISSIONS_CHANGED'}});
   }
   await audit(tx,input.actorId,'ROLE_PERMISSIONS_REPLACED','Rol',role.id,{permisos:before},{permisos:input.permisos});
  },serializable);
 }
 async getAudit(f:{userId:string;skip:number;take:number}){
  const where:Prisma.EventoAuditoriaWhereInput={entidad:'Usuario',entidadId:f.userId};
  const [rows,total]=await this.db.$transaction([
   this.db.eventoAuditoria.findMany({where,include:{usuario:{select:{id:true,nombre:true}}},
    orderBy:{creadoEn:'desc'},skip:f.skip,take:f.take}),
   this.db.eventoAuditoria.count({where})
  ]);
  return {data:rows.map(x=>({id:x.id,accion:x.accion,entidad:x.entidad,motivo:x.motivo,
   antes:x.antes,despues:x.despues,creadoEn:x.creadoEn,
   actor:x.usuario?{id:x.usuario.id,nombre:x.usuario.nombre}:null})),total};
 }
 async hasOpenOperations(userId:string):Promise<boolean>{
  const [cash,delivery,liquidations]=await Promise.all([
   this.db.turnoCaja.count({where:{cajeroId:userId,cerradaEn:null}}),
   this.db.entrega.count({where:{repartidorId:userId,estado:'EN_REPARTO'}}),
   this.db.liquidacionRepartidor.count({where:{repartidorId:userId,estado:'ABIERTA'}})
  ]);
  return cash+delivery+liquidations>0;
 }
}
