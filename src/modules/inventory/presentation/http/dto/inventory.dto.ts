import {Transform,Type} from 'class-transformer';
import {IsArray,ArrayMaxSize,ArrayUnique,IsBoolean,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateIf} from 'class-validator';
import type {Dimension,ArticleKind} from '../../../domain/inventory.policy.js';
export const booleanValue=(v:unknown)=>v==='true'?true:v==='false'?false:v;
export class PageDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100000) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsString() @MaxLength(100) search?:string;
}
export class OptionsDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) limit=20;
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @IsString() cursor?:string;
}
export class StatusDto {
 @IsBoolean() activo!:boolean;
 @IsString() @MinLength(3) @MaxLength(500) motivo!:string;
}
export class UnitDto{
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,49}$/) codigo!:string;
 @IsString() @MaxLength(120) @MinLength(1) nombre!:string;
 @IsIn(['UNIDAD','MASA','VOLUMEN','LONGITUD']) dimension!:Dimension;
 @IsOptional() @IsBoolean() esBase?:boolean;
}
export class RenameDto{ @IsString() @MinLength(1) @MaxLength(120) nombre!:string;}
export class UnitOptionsDto extends OptionsDto{
 @IsOptional() @IsIn(['UNIDAD','MASA','VOLUMEN','LONGITUD']) dimension?:Dimension;
}
export class ConversionListDto extends PageDto{
 @IsOptional() @IsIn(['UNIDAD','MASA','VOLUMEN','LONGITUD']) dimension?:Dimension;
}
export class ConversionDto{
 @IsString() unidadOrigenId!:string;
 @IsString() unidadDestinoId!:string;
 @IsString() @Matches(/^\d+(?:\.\d{1,10})?$/) factor!:string;
}
export class ConversionPreviewDto{
 @IsString() unidadOrigenId!:string;
 @IsString() unidadDestinoId!:string;
 @IsString() @Matches(/^\d+(?:\.\d{1,6})?$/) cantidad!:string;
}
const kinds=['INGREDIENTE','PREPARACION','PRODUCTO_TERMINADO','EMPAQUE','SUMINISTRO'] as const;
export class ArticleListDto extends PageDto{
 @IsOptional() @IsIn(kinds) tipo?:ArticleKind;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() activo?:boolean;
}
export class ArticleOptionsDto extends OptionsDto{
 @IsOptional() @IsIn(kinds) tipo?:ArticleKind;
}
export class ArticleCreateDto{
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,49}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(160) nombre!:string;
 @IsIn(kinds) tipo!:ArticleKind;
 @IsString() unidadBaseId!:string;
 @IsOptional() @IsBoolean() requiereLote?:boolean;
 @IsOptional() @IsBoolean() requiereVencimiento?:boolean;
 @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,6})?$/) costoReferencia?:string|null;
 @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,6})?$/) stockMinimo?:string|null;
}
export class ArticleUpdateDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(160) nombre?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() requiereLote?:boolean;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() requiereVencimiento?:boolean;
 @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,6})?$/) costoReferencia?:string|null;
 @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,6})?$/) stockMinimo?:string|null;
}
export class MediaIdsDto{
 @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsString({each:true}) mediaIds!:string[];
}
export class WarehouseListDto extends PageDto{
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() activo?:boolean;
}
export class WarehouseOptionsDto extends OptionsDto{
 @IsOptional() @IsString() sucursalId?:string;
}
export class WarehouseDto{
 @IsString() sucursalId!:string;
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,49}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(150) nombre!:string;
}
export class LocationListDto extends WarehouseListDto{
 @IsOptional() @IsString() almacenId?:string;
 @IsOptional() @Transform(({value})=>booleanValue(value)) @IsBoolean() esRecepcion?:boolean;
}
export class LocationOptionsDto extends WarehouseOptionsDto{
 @IsOptional() @IsString() almacenId?:string;
}
export class LocationDto{
 @IsString() almacenId!:string;
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,49}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(150) nombre!:string;
 @IsOptional() @IsBoolean() esRecepcion?:boolean;
}
export class LocationUpdateDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(150) nombre?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() esRecepcion?:boolean;
}
export class MasterReportDto{
 @IsOptional() @IsString() sucursalId?:string;
}
