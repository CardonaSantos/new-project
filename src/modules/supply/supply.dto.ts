import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,IsArray,IsBoolean,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
const quantity=/^(?=.*[1-9])(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
export class SupplyQueryDto{
 @IsString() sucursalId!:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class SupplyKeyDto{
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class SupplyRequestLineDto{
 @IsString() articuloId!:string;
 @Matches(quantity) cantidadSolicitada!:string;
}
export class SupplyRequestDto extends SupplyKeyDto{
 @IsString() almacenDestinoId!:string;
 @IsOptional() @IsString() @MaxLength(500) nota?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>SupplyRequestLineDto)
 lineas!:SupplyRequestLineDto[];
}
export class SupplySendLineDto{
 @IsString() articuloId!:string;
 @IsString() ubicacionOrigenId!:string;
 @IsString() ubicacionDestinoId!:string;
 @IsOptional() @IsString() loteId?:string;
 @Matches(quantity) cantidad!:string;
}
export class SupplySendDto extends SupplyKeyDto{
 @IsString() almacenOrigenId!:string;
 @IsOptional() @IsBoolean() inmediato?:boolean;
 @IsOptional() @IsString() @MaxLength(500) nota?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>SupplySendLineDto)
 lineas!:SupplySendLineDto[];
}
export class SupplyReceiveLineDto{
 @IsString() transferenciaLineaId!:string;
 @Matches(quantity) cantidadRecibida!:string;
}
export class SupplyReceiveDto extends SupplyKeyDto{
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>SupplyReceiveLineDto)
 lineas!:SupplyReceiveLineDto[];
}
export class SupplyCancelDto extends SupplyKeyDto{
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
}
export class SupplyAvailabilityDto{
 @IsString() almacenOrigenId!:string;
}
