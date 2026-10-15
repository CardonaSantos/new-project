import {Type,Transform} from 'class-transformer';
import {IsBoolean,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateIf} from 'class-validator';
import type {DeviceType} from '../../../domain/organization.types.js';

const booleanValue=(v:unknown)=>v==='true'?true:v==='false'?false:v;
export class PagedQueryDto {
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100000) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class BranchFilterDto extends PagedQueryDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() activo?:boolean;
}
export class OptionQueryDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @IsString() cursor?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) limit=20;
}
export class UpdateCompanyDto {
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(150) nombreComercial?:string;
 @IsOptional() @IsString() @MaxLength(180) razonSocial?:string|null;
 @IsOptional() @IsString() @MaxLength(40) nit?:string|null;
 @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/^[A-Za-z]{3}$/) moneda?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(64) zonaHoraria?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsIn(['PROMEDIO_PONDERADO','FIFO']) metodoValoracion?:'PROMEDIO_PONDERADO'|'FIFO';
}
export class CreateBranchDto {
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,31}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(120) nombre!:string;
 @IsOptional() @IsString() @MaxLength(300) direccion?:string;
 @IsOptional() @IsString() @MaxLength(35) telefono?:string;
 @IsOptional() @IsString() @MaxLength(64) zonaHoraria?:string;
}
export class UpdateBranchDto {
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(120) nombre?:string;
 @IsOptional() @IsString() @MaxLength(300) direccion?:string|null;
 @IsOptional() @IsString() @MaxLength(35) telefono?:string|null;
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MaxLength(64) zonaHoraria?:string;
}
export class StatusDto {
 @IsBoolean() activa!:boolean;
 @IsString() @MinLength(3) @MaxLength(500) motivo!:string;
}
export class ConfigDto {
 @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) horaCorteOperativo?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() exigeCobroAntesPreparar?:boolean;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() permiteStockNegativo?:boolean;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() permiteOrdenesQR?:boolean;
 @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/^[A-Za-z]{3}$/) moneda?:string;
}
export class DeviceFilterDto extends PagedQueryDto {
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() activo?:boolean;
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @IsIn(['POS','KDS','QUIOSCO','PANTALLA_TURNOS','IMPRESORA','OTRO']) tipo?:DeviceType;
}
export class DeviceOptionDto extends OptionQueryDto {
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @IsIn(['POS','KDS','QUIOSCO','PANTALLA_TURNOS','IMPRESORA','OTRO']) tipo?:DeviceType;
}
export class CreateDeviceDto {
 @IsString() sucursalId!:string;
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,31}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(120) nombre!:string;
 @IsIn(['POS','KDS','QUIOSCO','PANTALLA_TURNOS','IMPRESORA','OTRO']) tipo!:DeviceType;
 @IsOptional() @IsString() estacionPreparacionId?:string|null;
}
export class UpdateDeviceDto {
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(120) nombre?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsIn(['POS','KDS','QUIOSCO','PANTALLA_TURNOS','IMPRESORA','OTRO']) tipo?:DeviceType;
 @IsOptional() @IsString() estacionPreparacionId?:string|null;
}
