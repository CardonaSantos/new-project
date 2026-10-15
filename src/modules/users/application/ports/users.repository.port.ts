import type {UserRecord,UserFilters,UserOption,RoleRecord,RoleScope,AuditEntry,SessionInfo} from '../../domain/user.types.js';

export abstract class UsersRepositoryPort {
 abstract getUser(id:string):Promise<UserRecord|null>;
 abstract listUsers(filter:UserFilters):Promise<{data:UserRecord[];total:number}>;
 abstract options(input:{search?:string;sucursalId:string|null;purpose?:string;cursor?:string;limit:number}):Promise<{data:UserOption[];nextCursor:string|null}>;
 abstract create(input:{actorId:string;email:string;nombre:string;hash:string;
  apellidos?:string;telefono?:string;rolIds:{rolId:string;sucursalId:string|null}[]}):Promise<string>;
 abstract update(input:{actorId:string;userId:string;email?:string;nombre?:string;
  apellidos?:string|null;telefono?:string|null;idioma?:string;zonaHoraria?:string}):Promise<void>;
 abstract setActive(input:{actorId:string;userId:string;activo:boolean;motivo:string}):Promise<void>;
 abstract resetPassword(input:{actorId:string;userId:string;hash:string;motivo:string}):Promise<void>;
 abstract revokeSessions(input:{actorId:string;userId:string;sessionId?:string;motivo:string}):Promise<number>;
 abstract sessions(userId:string,page:number,limit:number):Promise<{data:SessionInfo[];total:number}>;
 abstract setAvatar(input:{actorId:string;userId:string;mediaId:string|null}):Promise<void>;
 abstract replaceAssignments(input:{actorId:string;userId:string;assignments:{rolId:string;sucursalId:string|null}[]}):Promise<void>;
 abstract countActiveSuperAdmins():Promise<number>;
 abstract isGlobalSuperAdmin(userId:string):Promise<boolean>;
 abstract userHasGlobalSuperAdmin(userId:string):Promise<boolean>;
 abstract roleById(id:string):Promise<RoleRecord|null>;
 abstract listRoles(filter:{search?:string;activo?:boolean;skip:number;take:number}):Promise<{data:RoleRecord[];total:number}>;
 abstract listPermissions():Promise<{id:string;codigo:string;descripcion:string|null;modulo:string}[]>;
 abstract createRole(input:{actorId:string;codigo:string;nombre:string;descripcion?:string;alcance:RoleScope}):Promise<string>;
 abstract updateRole(input:{actorId:string;roleId:string;nombre?:string;descripcion?:string|null;activo?:boolean}):Promise<void>;
 abstract replaceRolePermissions(input:{actorId:string;roleId:string;permisos:string[]}):Promise<void>;
 abstract getAudit(input:{userId:string;skip:number;take:number}):Promise<{data:AuditEntry[];total:number}>;
 abstract hasOpenOperations(userId:string):Promise<boolean>;
}
