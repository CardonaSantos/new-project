import {Type} from 'class-transformer';
import {IsEnum,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';

export class DeliveryListDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsEnum(['PENDIENTE','EN_REPARTO','ENTREGADA','CANCELADA'])
 estado?:'PENDIENTE'|'EN_REPARTO'|'ENTREGADA'|'CANCELADA';
 @IsOptional() @IsString() repartidorId?:string;
}
export class DeliveryKeyDto{
 @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9:_.-]{5,119}$/) claveOperacion!:string;
}
export class DeliveryCreateDto extends DeliveryKeyDto{
 @IsString() @MinLength(1) ordenId!:string;
 @IsOptional() @IsString() @MinLength(1) direccionId?:string;
 @IsOptional() @IsString() @MinLength(5) @MaxLength(500) direccionTexto?:string;
 @IsOptional() @IsString() @MaxLength(500) referenciaDireccion?:string|null;
 @IsOptional() @IsString() @MaxLength(45) telefonoContacto?:string|null;
 @IsOptional() @IsString() @MinLength(1) repartidorId?:string;
 @IsOptional() @IsString() @MinLength(1) canalExternoId?:string;
 @IsOptional() @IsString() @MaxLength(150) referenciaExterna?:string|null;
}
export class DeliveryDestinationDto extends DeliveryKeyDto{
 @IsOptional() @IsString() @MinLength(1) direccionId?:string;
 @IsOptional() @IsString() @MinLength(5) @MaxLength(500) direccionTexto?:string;
 @IsOptional() @IsString() @MaxLength(500) referenciaDireccion?:string|null;
 @IsOptional() @IsString() @MaxLength(45) telefonoContacto?:string|null;
}
export class DeliveryAssignDto extends DeliveryKeyDto{
 @IsString() @MinLength(1) repartidorId!:string;
}
export class DeliveryCancelDto extends DeliveryKeyDto{
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
}
