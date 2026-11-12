import {IsEnum,IsOptional,IsString,Matches,MinLength} from 'class-validator';
const date=/^\d{4}-\d{2}-\d{2}$/;
export class CashSessionReportDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsEnum(['DIA','SEMANA','MES','ANIO','PERSONALIZADO']) periodo!:'DIA'|'SEMANA'|'MES'|'ANIO'|'PERSONALIZADO';
 @IsOptional() @Matches(date) fecha?:string;
 @IsOptional() @Matches(date) desde?:string;
 @IsOptional() @Matches(date) hasta?:string;
}
export class CashSessionReportExportDto extends CashSessionReportDto{
 @IsEnum(['XLSX','PDF']) format!:'XLSX'|'PDF';
}
