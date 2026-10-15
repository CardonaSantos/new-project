import type {Prisma} from '../../../../generated/prisma/client.js';
import type {UserRecord,RoleRecord,UserOption} from '../../domain/user.types.js';

export const userInclude={
 perfil:true,
 usuarioRolesComoUsuario:{include:{rol:true,sucursal:true},orderBy:{creadoEn:'asc' as const}}
} as const;

type FullUser=Prisma.UsuarioGetPayload<{include:typeof userInclude}>;
type FullRole=Prisma.RolGetPayload<{include:{
 rolPermisosComoRol:{include:{permiso:true}},
 _count:{select:{usuarioRolesComoRol:true}}
}}>;

export class UsersMapper {
 static user(row:FullUser):UserRecord {
  return {id:row.id,email:row.email,nombre:row.nombre,activo:row.activo,
   debeCambiarContrasena:row.debeCambiarContrasena,ultimoAccesoEn:row.ultimoAccesoEn,
   creadoEn:row.creadoEn,actualizadoEn:row.actualizadoEn,
   perfil:row.perfil?{
    apellidos:row.perfil.apellidos,telefono:row.perfil.telefono,
    idioma:row.perfil.idioma,zonaHoraria:row.perfil.zonaHoraria,
    avatarMediaId:row.perfil.avatarMediaId
   }:null,
   assignments:row.usuarioRolesComoUsuario.map(r=>({
    id:r.id,rolId:r.rolId,rolCodigo:r.rol.codigo,rolNombre:r.rol.nombre,
    alcance:r.rol.alcance,sucursalId:r.sucursalId,sucursalNombre:r.sucursal?.nombre??null
   }))
  };
 }
 static role(row:FullRole):RoleRecord{
  return {id:row.id,codigo:row.codigo,nombre:row.nombre,descripcion:row.descripcion,
   alcance:row.alcance,activo:row.activo,version:row.version,
   usuariosAsignados:row._count.usuarioRolesComoRol,
   permisos:row.rolPermisosComoRol.map(x=>x.permiso.codigo).sort()
  };
 }
 static option(row:FullUser,sucursalId:string|null):UserOption{
  const roles=row.usuarioRolesComoUsuario.filter(r=>r.rol.activo&&
   (r.rol.alcance==='GLOBAL'&&r.sucursalId===null ||
     !!sucursalId&&r.sucursalId===sucursalId));
  const branch=roles.find(r=>r.sucursalId===sucursalId&&!!sucursalId)?.sucursal??null;
  return {id:row.id,label:[row.nombre,row.perfil?.apellidos].filter(Boolean).join(' '),
   email:row.email,avatarMediaId:row.perfil?.avatarMediaId??null,activo:row.activo,
   roles:[...new Map(roles.map(x=>[x.rolId,{codigo:x.rol.codigo,nombre:x.rol.nombre}])).values()],
   sucursal:branch?{id:branch.id,nombre:branch.nombre}:null
  };
 }
}
