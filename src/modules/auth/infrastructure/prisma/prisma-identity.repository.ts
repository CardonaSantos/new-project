import {createHash} from 'node:crypto';
import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from '../../../../infrastructure/database/prisma/prisma.service.js';
import {IdentityRepository,type Account,type Session,type RoleInfo} from '../../application/ports/identity.repository.js';

@Injectable()
export class PrismaIdentityRepository extends IdentityRepository {
 constructor(private readonly db:PrismaService){super();}
 async account(email:string):Promise<Account|null>{
  return this.db.usuario.findUnique({where:{email:email.toLowerCase()},select:{
   id:true,email:true,nombre:true,hashContrasena:true,activo:true,debeCambiarContrasena:true,versionAutorizacion:true
  }});
 }
 private sessionMap(row:({id:string;usuarioId:string;hashRefreshToken:string;expiraEn:Date;revocadaEn:Date|null;
  usuario:{activo:boolean;debeCambiarContrasena:boolean;versionAutorizacion:number;email:string;nombre:string}}|null)):Session|null{
  if(!row)return null;
  return {id:row.id,usuarioId:row.usuarioId,hashRefreshToken:row.hashRefreshToken,expiraEn:row.expiraEn,
   revocadaEn:row.revocadaEn,activo:row.usuario.activo,debeCambiarContrasena:row.usuario.debeCambiarContrasena,
   versionAutorizacion:row.usuario.versionAutorizacion,email:row.usuario.email,nombre:row.usuario.nombre};
 }
 async sessionById(id:string):Promise<Session|null>{
  return this.sessionMap(await this.db.sesionUsuario.findUnique({where:{id},include:{usuario:true}}));
 }
 async sessionByRefreshHash(hash:string):Promise<Session|null>{
  return this.sessionMap(await this.db.sesionUsuario.findUnique({where:{hashRefreshToken:hash},include:{usuario:true}}));
 }
 async createSession(input:{usuarioId:string;hash:string;expiraEn:Date;ip:string|null;userAgent:string|null}):Promise<string>{
  const row=await this.db.sesionUsuario.create({data:{
   usuarioId:input.usuarioId,hashRefreshToken:input.hash,expiraEn:input.expiraEn,ipCreacion:input.ip,userAgent:input.userAgent
  }});
  return row.id;
 }
 async rotate(id:string,oldHash:string,newHash:string):Promise<boolean>{
  const now=new Date();
  const changed=await this.db.sesionUsuario.updateMany({
   where:{id,hashRefreshToken:oldHash,revocadaEn:null,expiraEn:{gt:now}},
   data:{hashRefreshToken:newHash,ultimoUsoEn:now}
  });
  return changed.count===1;
 }
 async revoke(id:string,userId:string):Promise<void>{
  await this.db.sesionUsuario.updateMany({where:{id,usuarioId:userId,revocadaEn:null},data:{revocadaEn:new Date(),revocacionMotivo:'LOGOUT'}});
 }
 async revokeAll(userId:string):Promise<void>{
  await this.db.sesionUsuario.updateMany({where:{usuarioId:userId,revocadaEn:null},data:{revocadaEn:new Date(),revocacionMotivo:'LOGOUT_ALL'}});
 }
 async updatePassword(userId:string,hash:string):Promise<void>{
  await this.db.usuario.update({where:{id:userId},data:{
   hashContrasena:hash,debeCambiarContrasena:false,contrasenaCambiadaEn:new Date(),versionAutorizacion:{increment:1}
  }});
 }
 async touchLogin(userId:string):Promise<void>{
  await this.db.usuario.update({where:{id:userId},data:{ultimoAccesoEn:new Date()}});
 }
 async roles(userId:string):Promise<RoleInfo[]>{
  const rows=await this.db.usuarioRol.findMany({where:{usuarioId:userId},include:{rol:true}});
  return rows.filter(r=>r.rol.activo).map(r=>({codigo:r.rol.codigo,alcance:r.rol.alcance,sucursalId:r.sucursalId}));
 }
 async capabilities(userId:string,sucursalId:string|null):Promise<string[]>{
  const assignments=await this.db.usuarioRol.findMany({
   where:{usuarioId:userId,rol:{activo:true}},
   include:{rol:{include:{rolPermisosComoRol:{include:{permiso:true}}}}}
  });
  const permissions=new Set<string>();
  for(const membership of assignments){
   if(membership.rol.alcance==='GLOBAL'&&membership.sucursalId===null ||
      membership.rol.alcance==='SUCURSAL'&&sucursalId!==null&&membership.sucursalId===sucursalId){
    for(const rp of membership.rol.rolPermisosComoRol)permissions.add(rp.permiso.codigo);
   }
  }
  return [...permissions].sort();
 }
 async createUser(input:{actorId:string;email:string;nombre:string;hash:string}){
  const actor=await this.db.usuarioRol.findFirst({where:{
   usuarioId:input.actorId,sucursalId:null,rol:{codigo:'SUPER_ADMIN',alcance:'GLOBAL',activo:true}
  }});
  if(!actor)throw new ForbiddenException('Solo SUPER_ADMIN global puede crear usuarios');
  if(await this.db.usuario.findUnique({where:{email:input.email}}))throw new ConflictException('Correo ya registrado');
  const u=await this.db.usuario.create({data:{email:input.email,nombre:input.nombre,
   hashContrasena:input.hash,debeCambiarContrasena:true,perfil:{create:{}}}});
  return {id:u.id,email:u.email,nombre:u.nombre};
 }
 async assignRole(input:{actorId:string;userId:string;roleId:string;sucursalId:string|null}):Promise<void>{
  await this.db.$transaction(async(tx)=>{
   const actor=await tx.usuarioRol.findFirst({where:{usuarioId:input.actorId,sucursalId:null,
    rol:{codigo:'SUPER_ADMIN',alcance:'GLOBAL',activo:true}}});
   if(!actor)throw new ForbiddenException('Solo SUPER_ADMIN global puede asignar roles');
   const [role,target]=await Promise.all([tx.rol.findUnique({where:{id:input.roleId}}),tx.usuario.findUnique({where:{id:input.userId}})]);
   if(!role||!role.activo||!target||!target.activo)throw new NotFoundException('Usuario o rol no encontrado');
   if(role.alcance==='GLOBAL'&&input.sucursalId!==null ||
      role.alcance==='SUCURSAL'&&!input.sucursalId)throw new ConflictException('Alcance de rol inválido');
   if(input.sucursalId){
    const suc=await tx.sucursal.findUnique({where:{id:input.sucursalId}});
    if(!suc||!suc.activa)throw new NotFoundException('Sucursal no disponible');
   }
   const existing=await tx.usuarioRol.findFirst({where:{
    usuarioId:input.userId,rolId:input.roleId,sucursalId:input.sucursalId
   }});
   if(!existing)await tx.usuarioRol.create({data:{
    usuarioId:input.userId,rolId:input.roleId,sucursalId:input.sucursalId
   }});
   await tx.usuario.update({where:{id:input.userId},data:{versionAutorizacion:{increment:1}}});
   await tx.eventoAuditoria.create({data:{usuarioId:input.actorId,accion:'AUTH_ROLE_ASSIGNED',
    entidad:'UsuarioRol',entidadId:input.userId,despues:{rolId:input.roleId,sucursalId:input.sucursalId}}});
  });
 }
 private key(email:string){return createHash('sha256').update(email).digest('hex');}
 async loginBlocked(email:string,ip:string):Promise<boolean>{
  const after=new Date(Date.now()-15*60*1000),hash=this.key(email);
  const [targetCount,ipCount]=await Promise.all([
   this.db.intentoAcceso.count({where:{correoHash:hash,ip,creadoEn:{gte:after}}}),
   this.db.intentoAcceso.count({where:{ip,creadoEn:{gte:after}}})
  ]);
  return targetCount>=7||ipCount>=40;
 }
 async loginFailed(email:string,ip:string):Promise<void>{
  await this.db.intentoAcceso.create({data:{correoHash:this.key(email),ip}});
 }
}
