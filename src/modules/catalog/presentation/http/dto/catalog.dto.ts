import {Type,Transform} from 'class-transformer';
import {ArrayMaxSize,ArrayUnique,IsArray,IsBoolean,IsIn,IsInt,IsISO8601,IsOptional,
 IsString,Matches,Max,MaxLength,Min,MinLength,ValidateIf,ValidateNested} from 'class-validator';
import type {CatalogKind} from '../../../application/ports/catalog.repository.port.js';
const kinds=['PREPARADO','INVENTARIABLE','SERVICIO'] as const;
const bool=(v:unknown)=>v==='true'?true:v==='false'?false:v;
export class PageDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsString() @MaxLength(120) search?:string;
 @IsOptional() @Transform(({value})=>bool(value)) @IsBoolean() activo?:boolean;
}
export class OptionsDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) limit=20;
 @IsOptional() @IsString() @MaxLength(120) search?:string;
 @IsOptional() @IsString() cursor?:string;
}
export class CategoryCreateDto{
 @IsString() @MinLength(1) @MaxLength(130) nombre!:string;
 @IsOptional() @IsString() parentId?:string|null;
 @IsOptional() @IsInt() @Min(0) orden?:number;
}
export class CategoryPatchDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(130) nombre?:string;
 @IsOptional() @IsString() parentId?:string|null;
 @IsOptional() @IsInt() @Min(0) orden?:number;
}
export class StatusDto{
 @IsBoolean() activo!:boolean;
 @IsString() @MinLength(3) @MaxLength(500) motivo!:string;
}
export class VariantInputDto{
 @IsString() @MinLength(1) @MaxLength(120) nombre!:string;
 @IsOptional() @IsString() @MaxLength(50) sku?:string|null;
 @IsOptional() @IsString() articuloInventarioId?:string|null;
 @IsOptional() @IsInt() @Min(0) orden?:number;
}
export class ProductCreateDto{
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,49}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(160) nombre!:string;
 @IsOptional() @IsString() @MaxLength(1500) descripcion?:string|null;
 @IsOptional() @IsString() categoriaId?:string|null;
 @IsIn(kinds) tipo!:CatalogKind;
 @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({each:true}) @Type(()=>VariantInputDto) variantes?:VariantInputDto[];
}
export class ProductListDto extends PageDto{
 @IsOptional() @IsString() categoriaId?:string;
 @IsOptional() @IsIn(kinds) tipo?:CatalogKind;
}
export class ProductOptionsDto extends OptionsDto{
 @IsOptional() @IsString() sucursalId?:string;
}
export class BranchQueryDto{
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @IsISO8601() fecha?:string;
}
export class ProductPatchDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(160) nombre?:string;
 @IsOptional() @IsString() @MaxLength(1500) descripcion?:string|null;
 @IsOptional() @IsString() categoriaId?:string|null;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() visibleEnMenu?:boolean;
}
export class VariantPatchDto extends VariantInputDto{
 @IsOptional() @IsBoolean() activo?:boolean;
}
export class VariantOptionDto extends ProductOptionsDto{
 @IsOptional() @IsString() productoId?:string;
}
export class BranchVariantDto{
 @IsString() sucursalId!:string;
 @IsBoolean() habilitada!:boolean;
 @IsOptional() @IsISO8601() pausadaHasta?:string|null;
 @IsOptional() @IsString() @MaxLength(500) motivo?:string|null;
}
export class GroupCreateDto{
 @IsString() @MinLength(1) @MaxLength(130) nombre!:string;
 @IsInt() @Min(0) minimo!:number;
 @IsOptional() @IsInt() @Min(0) maximo?:number|null;
}
export class GroupPatchDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(130) nombre?:string;
 @IsOptional() @IsInt() @Min(0) minimo?:number;
 @IsOptional() @IsInt() @Min(0) maximo?:number|null;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() activo?:boolean;
}
export class ModifierCreateDto{
 @IsString() grupoId!:string;
 @IsString() @MinLength(1) @MaxLength(130) nombre!:string;
 @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/) incrementoPrecio!:string;
}
export class ModifierPatchDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(130) nombre?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/) incrementoPrecio?:string;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() activo?:boolean;
}
export class ModifierListDto extends PageDto{
 @IsOptional() @IsString() grupoId?:string;
}
export class AttachedGroupDto{
 @IsString() grupoId!:string;
 @IsInt() @Min(0) orden!:number;
 @IsBoolean() obligatorio!:boolean;
}
export class AttachGroupsDto{
 @IsArray() @ArrayMaxSize(20) @ValidateNested({each:true}) @Type(()=>AttachedGroupDto) grupos!:AttachedGroupDto[];
}
export class PriceCreateDto{
 @IsString() entityId!:string;
 @IsString() sucursalId!:string;
 @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/) importe!:string;
 @IsISO8601() vigenteDesde!:string;
 @IsOptional() @IsISO8601() vigenteHasta?:string|null;
}
export class PriceQueryDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsISO8601() fecha?:string;
}
export class QuoteDto{
 @IsString() varianteId!:string;
 @IsString() sucursalId!:string;
 @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({each:true}) modificadorIds!:string[];
 @IsOptional() @IsISO8601() fecha?:string;
}
export class ImageIdsDto{
 @IsArray() @ArrayMaxSize(12) @ArrayUnique() @IsString({each:true}) mediaIds!:string[];
}
export class MenuListDto extends PageDto{
 @IsOptional() @IsString() sucursalId?:string;
}
export class MenuCreateDto{
 @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,49}$/) codigo!:string;
 @IsString() @MinLength(1) @MaxLength(140) nombre!:string;
 @IsOptional() @IsString() @MaxLength(1500) descripcion?:string|null;
 @IsArray() @ArrayUnique() @IsString({each:true}) sucursalIds!:string[];
}
export class MenuPatchDto{
 @ValidateIf((_,v)=>v!==undefined) @IsString() @MinLength(1) @MaxLength(140) nombre?:string;
 @IsOptional() @IsString() @MaxLength(1500) descripcion?:string|null;
 @ValidateIf((_,v)=>v!==undefined) @IsBoolean() activo?:boolean;
}
export class MenuItemDto{
 @IsString() varianteId!:string;
 @IsInt() @Min(0) orden!:number;
}
export class MenuSectionDto{
 @IsString() @MinLength(1) @MaxLength(140) nombre!:string;
 @IsInt() @Min(0) orden!:number;
 @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>MenuItemDto) items!:MenuItemDto[];
}
export class MenuScheduleDto{
 @IsInt() @Min(0) @Max(6) diaSemana!:number;
 @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) desde!:string;
 @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) hasta!:string;
}
export class MenuLayoutDto{
 @IsInt() @Min(1) expectedVersion!:number;
 @IsArray() @ArrayMaxSize(30) @ValidateNested({each:true}) @Type(()=>MenuSectionDto) secciones!:MenuSectionDto[];
 @IsArray() @ArrayMaxSize(70) @ValidateNested({each:true}) @Type(()=>MenuScheduleDto) horarios!:MenuScheduleDto[];
 @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({each:true}) sucursalIds!:string[];
}
export class PublishDto{ @IsInt() @Min(1) expectedVersion!:number; }
