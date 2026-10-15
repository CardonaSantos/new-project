import {Type,Transform} from 'class-transformer';
import {IsArray,IsBoolean,IsEmail,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';

const booleanValue=(v:unknown)=>v==='true'?true:v==='false'?false:v;
export class PageDto {
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class UserFilterDto extends PageDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() activo?:boolean;
 @IsOptional() @IsString() rolId?:string;
 @IsOptional() @IsString() sucursalId?:string;
}
export class BranchQueryDto {
 @IsOptional() @IsString() sucursalId?:string;
}
export class AuditQueryDto extends PageDto {
 @IsOptional() @IsString() sucursalId?:string;
}
export class UserOptionDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @IsIn(['orders.create','delivery.manage','cash.open','inventory.adjust']) purpose?:string;
 @IsOptional() @IsString() cursor?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) limit=20;
}
export class AssignmentDto {
 @IsString() rolId!:string;
 @IsOptional() @IsString() sucursalId:string|null=null;
}
export class CreateUserDto {
 @IsEmail() @MaxLength(254) email!:string;
 @IsString() @MinLength(1) @MaxLength(100) nombre!:string;
 @IsOptional() @IsString() @MaxLength(100) apellidos?:string;
 @IsOptional() @IsString() @MaxLength(30) telefono?:string;
 @IsOptional() @IsString() @MinLength(12) @MaxLength(256) temporalPassword?:string;
 @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>AssignmentDto) assignments?:AssignmentDto[];
}
export class UpdateUserDto {
 @IsOptional() @IsEmail() @MaxLength(254) email?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(100) nombre?:string;
 @IsOptional() @IsString() @MaxLength(100) apellidos?:string|null;
 @IsOptional() @IsString() @MaxLength(30) telefono?:string|null;
 @IsOptional() @IsString() @MaxLength(16) idioma?:string;
 @IsOptional() @IsString() @MaxLength(64) zonaHoraria?:string;
}
export class SetStatusDto {
 @IsBoolean() activo!:boolean;
 @IsString() @MinLength(3) @MaxLength(500) motivo!:string;
}
export class ReasonDto {
 @IsString() @MinLength(3) @MaxLength(500) motivo!:string;
}
export class AvatarDto {
 @IsOptional() @IsString() mediaId:string|null=null;
}
export class AssignmentsDto {
 @IsArray() @ValidateNested({each:true}) @Type(()=>AssignmentDto) assignments!:AssignmentDto[];
}
export class UserRangeDto extends BranchQueryDto {
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?:string;
}
export class UserActivityDto extends UserRangeDto {
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsIn(['ORDEN','PAGO','CAJA','ENTREGA','INVENTARIO']) kind?:'ORDEN'|'PAGO'|'CAJA'|'ENTREGA'|'INVENTARIO';
}
export class UserReportDto extends UserRangeDto {
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class RoleFilterDto extends PageDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() activo?:boolean;
}
export class CreateRoleDto {
 @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(100) nombre!:string;
 @IsOptional() @IsString() @MaxLength(500) descripcion?:string;
 @IsIn(['GLOBAL','SUCURSAL']) alcance!:'GLOBAL'|'SUCURSAL';
}
export class UpdateRoleDto {
 @IsOptional() @IsString() @MinLength(1) @MaxLength(100) nombre?:string;
 @IsOptional() @IsString() @MaxLength(500) descripcion?:string|null;
 @IsOptional() @IsBoolean() activo?:boolean;
}
export class RolePermissionsDto {
 @IsArray() @IsString({each:true}) permisos!:string[];
}
