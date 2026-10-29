import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsInt,IsOptional,IsString,
 Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
import {amountPattern} from '../../../domain/settlement.policy.js';
const key=/^[A-Za-z0-9][A-Za-z0-9:_.-]{5,119}$/;
export class SettlementKeyDto{
 @IsString() @Matches(key) claveOperacion!:string;
}
export class SettlementBranchDto{
 @IsString() @MinLength(1) sucursalId!:string;
}
export class SettlementPageDto extends SettlementBranchDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsString() repartidorId?:string;
}
export class CourierCashDto extends SettlementKeyDto{
 @IsString() @MinLength(1) cuentaId!:string;
 @Matches(amountPattern) monto!:string;
}
export class CreateCourierSettlementDto extends SettlementKeyDto{
 @IsString() sucursalId!:string;
 @IsString() repartidorId!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique()
 @IsString({each:true}) pagoIds!:string[];
}
export class CloseCourierSettlementDto extends SettlementKeyDto{
 @IsString() turnoCajaId!:string;
 @Matches(amountPattern) totalEntregado!:string;
}
export class PlatformSettlementLineDto{
 @IsString() entregaId!:string;
 @IsString() cuentaId!:string;
 @Matches(amountPattern) importeBruto!:string;
 @Matches(amountPattern) comision!:string;
}
export class PlatformChannelDto extends SettlementKeyDto{
 @IsString() sucursalId!:string;
 @IsString() @MinLength(2) @MaxLength(40) @Matches(/^[A-Z0-9_-]+$/) codigo!:string;
 @IsString() @MinLength(2) @MaxLength(100) nombre!:string;
}
export class CreatePlatformSettlementDto extends SettlementKeyDto{
 @IsString() sucursalId!:string;
 @IsString() canalId!:string;
 @IsString() cuentaFinancieraId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) periodoInicio!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) periodoFin!:string;
 @IsString() @MinLength(6) @MaxLength(160) referencia!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>PlatformSettlementLineDto) lineas!:PlatformSettlementLineDto[];
}
