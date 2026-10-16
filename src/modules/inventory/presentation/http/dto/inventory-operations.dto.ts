import {IsBoolean,IsIn,IsInt,IsISO8601,IsOptional,IsString,Matches,Max,MaxLength,Min,ValidateNested,IsArray,ArrayMaxSize,ArrayMinSize} from 'class-validator';
import {Type} from 'class-transformer';
const money=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const qty=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
export class StockBranchDto {
 @IsString() sucursalId!:string;
 @IsOptional() @IsString() articuloId?:string;
 @IsOptional() @IsString() almacenId?:string;
 @IsOptional() @IsString() ubicacionId?:string;
 @IsOptional() @IsString() loteId?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class LotCreateDto{
 @IsString() articuloId!:string;
 @IsString() @MaxLength(100) codigoLote!:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaElaboracion?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaVencimiento?:string;
}
export class LotStatusDto {
 @IsBoolean() bloqueado!:boolean;
 @IsString() @MaxLength(500) motivo!:string;
}
export class ManualPostingDto{
 @IsString() articuloId!:string;
 @IsString() ubicacionId!:string;
 @IsOptional() @IsString() loteId?:string;
 @IsString() @Matches(qty) cantidad!:string;
 @IsOptional() @IsString() @Matches(money) costoUnitario?:string;
 @IsString() @MaxLength(120) claveOperacion!:string;
 @IsString() @MaxLength(500) motivo!:string;
}
export class RecountLineDto{
 @IsString() articuloId!:string;
 @IsString() ubicacionId!:string;
 @IsOptional() @IsString() loteId?:string;
 @IsString() @Matches(qty) cantidadContada!:string;
 @IsOptional() @IsString() @Matches(money) costoUnitarioEntrada?:string;
}
export class CountCreateDto {
 @IsString() almacenId!:string;
 @IsString() @MaxLength(500) nota!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>RecountLineDto)
 lineas!:RecountLineDto[];
}
export class TransferLineDto{
 @IsString() articuloId!:string;
 @IsString() ubicacionOrigenId!:string;
 @IsString() ubicacionDestinoId!:string;
 @IsOptional() @IsString() loteId?:string;
 @IsString() @Matches(qty) cantidad!:string;
}
export class TransferCreateDto{
 @IsString() almacenOrigenId!:string;
 @IsString() almacenDestinoId!:string;
 @IsString() @MaxLength(500) nota!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>TransferLineDto)
 lineas!:TransferLineDto[];
}
export class OperationKeyDto{
 @IsString() @MaxLength(120) claveOperacion!:string;
}
export class IdDto { @IsString() id!:string; }

export class InternalConsumptionDto extends OperationKeyDto{
 @IsString() articuloId!:string;
 @IsString() ubicacionId!:string;
 @IsOptional() @IsString() loteId?:string;
 @Matches(qty) cantidad!:string;
 @IsString() @MaxLength(100) destinoUso!:string;
 @IsString() @MaxLength(500) motivo!:string;
}
