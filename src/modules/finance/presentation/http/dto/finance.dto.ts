import {Type} from 'class-transformer';
import {IsBoolean,IsIn,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';

export class FinanceAccountQueryDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @Type(()=>Number) @IsInt() @Min(1) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class FinanceOperationIntentDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsIn(['FIN_ACCOUNT_CREATE','FIN_EXPENSE_CREATE','FIN_EXTERNAL_POST','FIN_ROUTING_UPSERT','FIN_DAY_CLOSE','FIN_STATEMENT_IMPORT','FIN_STATEMENT_MATCH','FIN_STATEMENT_UNMATCH','FIN_LEDGER_REVERSE'])
 accion!:'FIN_ACCOUNT_CREATE'|'FIN_EXPENSE_CREATE'|'FIN_EXTERNAL_POST'|'FIN_ROUTING_UPSERT'|'FIN_DAY_CLOSE'|'FIN_STATEMENT_IMPORT'|'FIN_STATEMENT_MATCH'|'FIN_STATEMENT_UNMATCH'|'FIN_LEDGER_REVERSE';
}
export class FinanceOperationDto{
 @Matches(/^FIN:[0-9a-f-]{36}$/) operationId!:string;
}
export class FinanceAccountCreateDto extends FinanceOperationDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsString() @MinLength(2) @MaxLength(160) nombre!:string;
 @IsIn(['BANCO','TARJETA_EMPRESA','EFECTIVO_EXTERNO'])
 tipo!:'BANCO'|'TARJETA_EMPRESA'|'EFECTIVO_EXTERNO';
}
export class FinanceMovementQueryDto{
 @Type(()=>Number) @IsInt() @Min(1) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class FinanceExpenseQueryDto extends FinanceAccountQueryDto{}
export class FinanceExpenseCreateDto extends FinanceOperationDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsIn(['CAJA','CUENTA_FINANCIERA']) origen!:'CAJA'|'CUENTA_FINANCIERA';
 @IsString() @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/) monto!:string;
 @IsString() @MinLength(3) @MaxLength(500) descripcion!:string;
 @IsOptional() @IsString() @MinLength(2) @MaxLength(100) categoria?:string;
 @IsOptional() @IsString() @MinLength(1) proveedorId?:string;
 @IsOptional() @IsString() @MinLength(1) turnoId?:string;
 @IsOptional() @IsString() @MinLength(1) cuentaFinancieraId?:string;
 @IsOptional() @IsString() @MinLength(2) @MaxLength(160) documentoReferencia?:string;
}

export class FinanceExternalPendingQueryDto extends FinanceAccountQueryDto{
 @IsIn(['PAGO','REEMBOLSO_PAGO','PAGO_PROVEEDOR'])
 sourceType!:'PAGO'|'REEMBOLSO_PAGO'|'PAGO_PROVEEDOR';
}
export class FinanceExternalPostDto extends FinanceOperationDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsIn(['PAGO','REEMBOLSO_PAGO','PAGO_PROVEEDOR'])
 sourceType!:'PAGO'|'REEMBOLSO_PAGO'|'PAGO_PROVEEDOR';
 @IsString() @MinLength(1) sourceId!:string;
 @IsString() @MinLength(1) cuentaFinancieraId!:string;
}

export class FinanceRouteUpsertDto extends FinanceOperationDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsIn(['TARJETA','TRANSFERENCIA','OTRO']) metodo!:'TARJETA'|'TRANSFERENCIA'|'OTRO';
 @IsString() @MinLength(1) cuentaFinancieraId!:string;
 @IsOptional() @IsBoolean() activa?:boolean;
}
