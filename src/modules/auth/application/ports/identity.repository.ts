export type Account = {id:string;email:string;nombre:string;hashContrasena:string;activo:boolean;debeCambiarContrasena:boolean;versionAutorizacion:number};
export type Session = {id:string;usuarioId:string;hashRefreshToken:string;expiraEn:Date;revocadaEn:Date|null;activo:boolean;debeCambiarContrasena:boolean;versionAutorizacion:number;email:string;nombre:string};
export type RoleInfo = {codigo:string;alcance:'GLOBAL'|'SUCURSAL';sucursalId:string|null};
export abstract class IdentityRepository {
 abstract account(email:string):Promise<Account|null>;
 abstract sessionById(id:string):Promise<Session|null>;
 abstract sessionByRefreshHash(hash:string):Promise<Session|null>;
 abstract createSession(input:{usuarioId:string;hash:string;expiraEn:Date;ip:string|null;userAgent:string|null}):Promise<string>;
 abstract rotate(id:string,oldHash:string,newHash:string):Promise<boolean>;
 abstract revoke(id:string,userId:string):Promise<void>;
 abstract revokeAll(userId:string):Promise<void>;
 abstract changePasswordAndRevokeSessions(userId:string,hash:string):Promise<void>;
 abstract touchLogin(userId:string):Promise<void>;
 abstract roles(userId:string):Promise<RoleInfo[]>;
 abstract capabilities(userId:string,sucursalId:string|null):Promise<string[]>;
 abstract createUser(input:{actorId:string;email:string;nombre:string;hash:string}):Promise<{id:string;email:string;nombre:string}>;
 abstract assignRole(input:{actorId:string;userId:string;roleId:string;sucursalId:string|null}):Promise<void>;
 abstract loginBlocked(email:string,ip:string):Promise<boolean>;
 abstract loginFailed(email:string,ip:string):Promise<void>;
}
