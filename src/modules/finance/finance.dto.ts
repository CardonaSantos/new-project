import {Type} from 'class-transformer';
import {IsIn,IsInt,IsString,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';

export class FinanceAccountQueryDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @Type(()=>Number) @IsInt() @Min(1) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class FinanceAccountCreateDto{
 @Matches(/^[\w:.-]{6,120}$/) claveOperacion!:string;
 @IsString() @MinLength(1) sucursalId!:string;
 @IsString() @MinLength(2) @MaxLength(160) nombre!:string;
 @IsIn(['BANCO','TARJETA_EMPRESA','EFECTIVO_EXTERNO']) tipo!:'BANCO'|'TARJETA_EMPRESA'|'EFECTIVO_EXTERNO';
}
export class FinanceMovementQueryDto{
 @Type(()=>Number) @IsInt() @Min(1) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
