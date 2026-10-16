import {ArrayMaxSize,ArrayMinSize,IsArray,IsBoolean,IsEnum,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
const Q=/^(?!0(?:\.0{1,3})?$)(?:0|[1-9]\d{0,13})(?:\.\d{1,3})?$/;
export class ModifierSelectionDto{
 @IsString() modificadorId!:string;
}
export class OrderItemDto{
 @IsString() varianteId!:string;
 @IsString() @Matches(Q) cantidad!:string;
 @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({each:true})
 @Type(()=>ModifierSelectionDto) modificadores?:ModifierSelectionDto[];
 @IsOptional() @IsString() @Matches(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/) descuento?:string;
 @IsOptional() @IsString() @MaxLength(300) notasCocina?:string;
}
export class CreateOrderDto{
 @IsString() sucursalId!:string;
 @IsEnum(['MESA','MOSTRADOR','PARA_LLEVAR','DELIVERY']) modalidad!:'MESA'|'MOSTRADOR'|'PARA_LLEVAR'|'DELIVERY';
 @IsOptional() @IsEnum(['CAJA','MESERO','QUIOSCO','QR','WEB','TELEFONO','PLATAFORMA'])
 origen?:'CAJA'|'MESERO'|'QUIOSCO'|'QR'|'WEB'|'TELEFONO'|'PLATAFORMA';
 @IsOptional() @IsString() mesaId?:string;
 @IsOptional() @IsString() clienteId?:string;
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>OrderItemDto) lineas!:OrderItemDto[];
 @IsOptional() @IsBoolean() enviarCocina?:boolean;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class AddItemsDto{
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>OrderItemDto) lineas!:OrderItemDto[];
 @IsOptional() @IsBoolean() enviarCocina?:boolean;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class EditLineDto{
 @IsOptional() @IsString() @Matches(Q) cantidad?:string;
 @IsOptional() @IsString() @Matches(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/) descuento?:string;
 @IsOptional() @IsString() @MaxLength(300) notasCocina?:string;
 @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({each:true})
 @Type(()=>ModifierSelectionDto) modificadores?:ModifierSelectionDto[];
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class EditOrderDto{
 @IsOptional() @IsString() @MaxLength(500) observaciones?:string;
 @IsOptional() @IsString() clienteId?:string;
 @IsInt() @Type(()=>Number) @Min(1) version!:number;
}
export class ReasonDto{
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
}
export class SendDto{
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class OrderListDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsEnum(['ABIERTA','CERRADA','CANCELADA']) estado?:'ABIERTA'|'CERRADA'|'CANCELADA';
 @IsOptional() @IsEnum(['MESA','MOSTRADOR','PARA_LLEVAR','DELIVERY']) modalidad?:'MESA'|'MOSTRADOR'|'PARA_LLEVAR'|'DELIVERY';
 @IsOptional() @IsString() search?:string;
 @IsOptional() @IsInt() @Type(()=>Number) @Min(1) page=1;
 @IsOptional() @IsInt() @Type(()=>Number) @Min(1) @Max(100) limit=20;
}
export class BranchQueryDto{
 @IsString() sucursalId!:string;
}
export class RoomDto{
 @IsString() sucursalId!:string;
 @IsString() @MinLength(2) @MaxLength(100) nombre!:string;
}
export class TableDto{
 @IsString() salaId!:string;
 @IsString() @MinLength(1) @MaxLength(20) numero!:string;
 @IsInt() @Min(1) @Max(40) capacidad!:number;
}
export class StationDto{
 @IsString() sucursalId!:string;
 @IsString() @MinLength(2) @MaxLength(100) nombre!:string;
 @IsOptional() @IsString() ubicacionConsumoId?:string;
}
export class StationUpdateDto{
 @IsOptional() @IsString() @MinLength(2) @MaxLength(100) nombre?:string;
 @IsOptional() @IsBoolean() activa?:boolean;
 @IsOptional() @IsString() ubicacionConsumoId?:string;
}
export class RouteDto{
 @IsString() estacionId!:string;
 @IsOptional() @IsString() varianteId?:string;
 @IsOptional() @IsString() categoriaId?:string;
 @IsOptional() @IsInt() @Min(0) @Max(1000) prioridad?:number;
}
export class TicketListDto{
 @IsString() sucursalId!:string;
 @IsOptional() @IsString() estacionId?:string;
 @IsOptional() @IsEnum(['PENDIENTE','PREPARANDO','LISTA','CANCELADA'])
 estado?:'PENDIENTE'|'PREPARANDO'|'LISTA'|'CANCELADA';
 @IsOptional() @IsInt() @Type(()=>Number) @Min(1) page=1;
 @IsOptional() @IsInt() @Type(()=>Number) @Min(1) @Max(100) limit=20;
}
export class StartLineDto{
 @IsOptional() @IsString() @Matches(Q) cantidad?:string;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
