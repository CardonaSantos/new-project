import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,IsArray,IsBoolean,IsEnum,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,ValidateNested} from 'class-validator';
const positive=/^(?!0(?:\.0{1,3})?$)(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
export class OrderModifierDto{
 @IsString() modificadorId!:string;
 @IsOptional() @IsInt() @Min(1) @Max(20) cantidad?:number;
}
export class OrderLineDto{
 @IsString() varianteId!:string;
 @IsString() @Matches(positive) cantidad!:string;
 @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({each:true})
 @Type(()=>OrderModifierDto) modificadores?:OrderModifierDto[];
 @IsOptional() @IsString() @MaxLength(500) notasCocina?:string;
}
export class OrderCreateDto{
 @IsString() sucursalId!:string;
 @IsEnum(['MESA','MOSTRADOR','PARA_LLEVAR','DELIVERY']) modalidad!:'MESA'|'MOSTRADOR'|'PARA_LLEVAR'|'DELIVERY';
 @IsOptional() @IsEnum(['CAJA','MESERO','QUIOSCO','QR','WEB','TELEFONO','PLATAFORMA']) origen?:'CAJA'|'MESERO'|'QUIOSCO'|'QR'|'WEB'|'TELEFONO'|'PLATAFORMA';
 @IsOptional() @IsString() ocupacionMesaId?:string;
 @IsOptional() @IsString() clienteId?:string;
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsOptional() @IsBoolean() enviarCocina?:boolean;
 @IsOptional() @IsString() @MaxLength(120) claveOperacion?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>OrderLineDto) lineas!:OrderLineDto[];
}
export class AddLinesDto{
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>OrderLineDto) lineas!:OrderLineDto[];
 @IsOptional() @IsBoolean() enviarCocina?:boolean;
 @IsString() @MaxLength(120) claveOperacion!:string;
}
export class OrderPageDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsInt() @Min(1) @Type(()=>Number) page=1;
 @IsOptional() @IsInt() @Min(1) @Max(100) @Type(()=>Number) limit=20;
 @IsOptional() @IsEnum(['ABIERTA','CERRADA','CANCELADA']) estado?:'ABIERTA'|'CERRADA'|'CANCELADA';
}
export class KitchenPageDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsString() estacionId?:string;
 @IsOptional() @IsEnum(['PENDIENTE','PREPARANDO','LISTA','CANCELADA']) estado?:'PENDIENTE'|'PREPARANDO'|'LISTA'|'CANCELADA';
 @IsOptional() @IsInt() @Min(1) @Type(()=>Number) page=1;
 @IsOptional() @IsInt() @Min(1) @Max(100) @Type(()=>Number) limit=20;
}
export class TableDto{
 @IsString() sucursalId!:string;
 @IsString() nombre!:string;
}
export class TableOpenDto{
 @IsString() mesaId!:string;
}
export class StationDto{
 @IsString() sucursalId!:string;
 @IsString() @MaxLength(120) nombre!:string;
 @IsOptional() @IsString() ubicacionConsumoId?:string;
}
export class RouteDto{
 @IsString() estacionId!:string;
 @IsOptional() @IsString() varianteId?:string;
 @IsOptional() @IsString() categoriaId?:string;
 @IsOptional() @IsInt() @Min(0) prioridad?:number;
}
