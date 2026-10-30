import {Type} from 'class-transformer';
import {IsEnum,IsInt,IsOptional,IsString,Matches,Max,Min,MinLength} from 'class-validator';
const date=/^\d{4}-\d{2}-\d{2}$/;
export class BranchReportDto{
 @IsString() @MinLength(1) sucursalId!:string;
}
export class ReportPeriodDto extends BranchReportDto{
 @IsEnum(['DIA','SEMANA','MES','PERSONALIZADO']) periodo!:'DIA'|'SEMANA'|'MES'|'PERSONALIZADO';
 @IsOptional() @Matches(date) fecha?:string;
 @IsOptional() @Matches(date) desde?:string;
 @IsOptional() @Matches(date) hasta?:string;
}
export class TicketsReportDto extends ReportPeriodDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}

/** Access always requires sucursalId; pagination is bounded to avoid unbounded evidence dumps. */
export class CashEvidenceDto extends BranchReportDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsEnum(['INGRESO','EGRESO']) tipo?:'INGRESO'|'EGRESO';
}
