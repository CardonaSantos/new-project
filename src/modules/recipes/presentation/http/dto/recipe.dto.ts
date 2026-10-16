import {ArrayMaxSize,ArrayMinSize,IsArray,IsBoolean,IsEnum,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
const qty=/^(?!0(?:\.0{1,6})?$)(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
const percent=/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/;
export class ComponentDto{
 @IsString() articuloId!:string;
 @IsString() unidadId!:string;
 @IsString() @Matches(qty) cantidad!:string;
 @IsOptional() @IsString() @Matches(percent) mermaPorcentaje?:string;
}
export class VersionDto{
 @IsString() unidadRendimientoId!:string;
 @IsString() @Matches(qty) rendimiento!:string;
 @IsOptional() @IsInt() @Min(0) @Max(3650) vidaUtilDias?:number;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>ComponentDto) componentes!:ComponentDto[];
 @IsOptional() @IsBoolean() publicar?:boolean;
}
export class CreateRecipeDto{
 @IsString() @MaxLength(160) nombre!:string;
 @IsEnum(['VENTA','PRODUCCION']) tipo!:'VENTA'|'PRODUCCION';
 @IsOptional() @IsString() varianteId?:string;
 @IsOptional() @IsString() articuloResultadoId?:string;
 @IsOptional() @ValidateNested() @Type(()=>VersionDto) version?:VersionDto;
}
export class UpdateRecipeDto{
 @IsOptional() @IsString() @MaxLength(160) nombre?:string;
 @IsOptional() @IsBoolean() activa?:boolean;
}
export class ListRecipesDto{
 @IsOptional() @IsEnum(['VENTA','PRODUCCION']) tipo?:'VENTA'|'PRODUCCION';
 @IsOptional() @IsString() search?:string;
 @IsOptional() @IsString() varianteId?:string;
 @IsOptional() @IsString() articuloResultadoId?:string;
 @IsOptional() @IsInt() @Min(1) @Type(()=>Number) page=1;
 @IsOptional() @IsInt() @Min(1) @Max(100) @Type(()=>Number) limit=20;
}
export class PreviewDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsString() ubicacionId?:string;
 @IsOptional() @IsString() @Matches(qty) cantidad?:string;
}
export class ModifierComponentDto extends ComponentDto{
 @IsEnum(['SUMAR','RESTAR','SUSTITUIR']) efecto!:'SUMAR'|'RESTAR'|'SUSTITUIR';
 @IsOptional() @IsString() sustituyeArticuloId?:string;
}
export class ModifierCompositionDto{
 @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>ModifierComponentDto)
 componentes!:ModifierComponentDto[];
}
export class PackagingItemDto{
 @IsString() articuloId!:string;
 @IsString() @Matches(qty) cantidad!:string;
}
export class PackagingRuleDto{
 @IsString() @MaxLength(120) nombre!:string;
 @IsEnum(['ARTICULO','ORDEN']) alcance!:'ARTICULO'|'ORDEN';
 @IsEnum(['MESA','MOSTRADOR','PARA_LLEVAR','DELIVERY']) modalidad!:
 'MESA'|'MOSTRADOR'|'PARA_LLEVAR'|'DELIVERY';
 @IsOptional() @IsString() varianteId?:string;
 @IsOptional() @IsString() sucursalId?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>PackagingItemDto) lineas!:PackagingItemDto[];
}
export class PackagingQueryDto{
 @IsOptional() @IsString() sucursalId?:string;
 @IsOptional() @IsString() varianteId?:string;
}
export class SourceDto{
 @IsString() articuloId!:string;
 @IsString() ubicacionId!:string;
 @IsOptional() @IsString() loteId?:string;
}
export class ExecuteProductionDto{
 @IsString() recetaVersionId!:string;
 @IsString() ubicacionDestinoId!:string;
 @IsOptional() @IsString() ubicacionConsumoId?:string;
 @IsString() @Matches(qty) cantidadProducida!:string;
 @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>SourceDto) origenes?:SourceDto[];
 @IsOptional() @IsString() @MaxLength(120) claveOperacion?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaVencimiento?:string;
}
export class ListProductionsDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsInt() @Min(1) @Type(()=>Number) page=1;
 @IsOptional() @IsInt() @Min(1) @Max(100) @Type(()=>Number) limit=20;
}
