export interface UserAssignment {
  id: string;
  rolId: string;
  rolCodigo: string;
  rolNombre: string;
  alcance: 'GLOBAL'|'SUCURSAL';
  sucursalId: string|null;
  sucursalNombre: string|null;
}
export interface UserRecord {
  id:string;email:string;nombre:string;activo:boolean;debeCambiarContrasena:boolean;
  ultimoAccesoEn:Date|null;creadoEn:Date;actualizadoEn:Date;
  perfil:{apellidos:string|null;telefono:string|null;idioma:string;zonaHoraria:string;avatarMediaId:string|null}|null;
  assignments:UserAssignment[];
}
export interface UserFilters {
  search?:string;activo?:boolean;rolId?:string;sucursalId?:string;
  skip:number;take:number;
}
export interface UserOption {
  id:string;label:string;email:string;avatarMediaId:string|null;activo:boolean;
  roles:{codigo:string;nombre:string}[];
  sucursal:{id:string;nombre:string}|null;
}
export type RoleScope='GLOBAL'|'SUCURSAL';
export interface RoleRecord {
  id:string;codigo:string;nombre:string;descripcion:string|null;alcance:RoleScope;
  activo:boolean;version:number;usuariosAsignados:number;permisos:string[];
}
export interface AuditEntry {
  id:string;accion:string;entidad:string;motivo:string|null;
  antes:unknown;despues:unknown;creadoEn:Date;
  actor:{id:string;nombre:string}|null;
}
export interface SessionInfo {
  id:string;dispositivoId:string|null;dispositivoNombre:string|null;
  userAgent:string|null;ipCreacion:string|null;creadaEn:Date;ultimoUsoEn:Date|null;
  expiraEn:Date;revocadaEn:Date|null;revocacionMotivo:string|null;
}
