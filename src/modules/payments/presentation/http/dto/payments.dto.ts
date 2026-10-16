
import {Type} from 'class-transformer';
import {IsArray,ArrayMinSize,ArrayMaxSize,IsBoolean,IsEnum,IsInt,IsOptional,IsString,
 MaxLength,MinLength,Matches,Min,Max,ValidateNested,IsIn} from 'class-validator';
const cash=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/;
const quantity=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,3})?$/;
export class BranchDto{
 @IsString() @MinLength(1) sucursalId!:string;
}
export class PageDto extends BranchDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class RegisterDto extends BranchDto{
 @IsString() @MinLength(1) @MaxLength(40) codigo!:string;
 @IsString() @MinLength(2) @MaxLength(120) nombre!:string;
}
export class RegisterPatchDto{
 @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nombre?:string;
 @IsOptional() @IsBoolean() activa?:boolean;
}
export class ShiftOpenDto{
 @IsString() cajaId!:string;
 @Matches(cash) fondoInicial!:string;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class ShiftMovementDto{
 @IsEnum(['INGRESO','EGRESO']) tipo!:'INGRESO'|'EGRESO';
 @Matches(cash) monto!:string;
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class ShiftCloseDto{
 @Matches(cash) efectivoContado!:string;
 @IsOptional() @IsString() @MaxLength(500) notaCierre?:string;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class PaymentPartDto{
 @IsEnum(['EFECTIVO','TARJETA','TRANSFERENCIA','OTRO'])
 metodo!:'EFECTIVO'|'TARJETA'|'TRANSFERENCIA'|'OTRO';
 @Matches(cash) monto!:string;
 @IsOptional() @IsString() @MaxLength(160) referencia?:string;
 @IsOptional() @IsString() @MaxLength(160) codigoAutorizacion?:string;
 @IsOptional() @IsString() @MaxLength(160) terminalReferencia?:string;
}
export class CollectDto{
 @IsString() turnoId!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({each:true}) @Type(()=>PaymentPartDto)
 pagos!:PaymentPartDto[];
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class ConfirmAttemptDto{
 @IsString() turnoId!:string;
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class RefundDto{
 @Matches(cash) monto!:string;
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
 @IsOptional() @IsString() @MaxLength(160) referenciaExterna?:string;
 @IsOptional() @IsString() turnoId?:string;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class AllocateDto{
 @IsString() ordenLineaId!:string;
 @Matches(quantity) cantidadAsignada!:string;
 @Matches(cash) importeAsignado!:string;
}
export class AccountAllocationDto{
 @IsString() @MinLength(1) @MaxLength(120) nombre!:string;
 @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>AllocateDto)
 lineas!:AllocateDto[];
}
export class SplitDto{
 @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20) @ValidateNested({each:true})
 @Type(()=>AccountAllocationDto) cuentas!:AccountAllocationDto[];
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
export class EqualSplitDto{
 @IsInt() @Min(2) @Max(20) personas!:number;
 @IsString() @MinLength(6) @MaxLength(120) claveOperacion!:string;
}
