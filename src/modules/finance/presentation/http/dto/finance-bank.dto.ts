import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,IsArray,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
import {bankAmount} from '../../../domain/bank-reconciliation.policy.js';
export class BankQueryDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsString() @MinLength(1) cuentaFinancieraId!:string;
 @IsOptional() @IsIn(['PENDIENTE','CONCILIADO']) estado?:'PENDIENTE'|'CONCILIADO';
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
class FinanceOperation{
 @Matches(/^FIN:[0-9a-f-]{36}$/) operationId!:string;
 @IsString() @MinLength(1) sucursalId!:string;
}
export class BankLineDto{
 @IsString() @MinLength(3) @MaxLength(160) claveExterna!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha!:string;
 @Matches(bankAmount) monto!:string;
 @IsOptional() @IsString() @MaxLength(160) referencia?:string;
 @IsOptional() @IsString() @MaxLength(500) descripcion?:string;
}
export class BankImportDto extends FinanceOperation{
 @IsString() @MinLength(1) cuentaFinancieraId!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true})
 @Type(()=>BankLineDto) lineas!:BankLineDto[];
}
export class BankMatchDto extends FinanceOperation{
 @IsString() @MinLength(1) lineaId!:string;
 @IsString() @MinLength(1) movimientoId!:string;
}
export class BankUnmatchDto extends FinanceOperation{
 @IsString() @MinLength(1) lineaId!:string;
 @IsString() @MinLength(10) @MaxLength(500) motivo!:string;
}
export class BankReverseDto extends FinanceOperation{
 @IsString() @MinLength(1) movimientoId!:string;
 @IsString() @MinLength(10) @MaxLength(500) motivo!:string;
}
