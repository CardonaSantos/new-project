import {IsEnum,IsOptional,IsString,Matches,MinLength} from 'class-validator';
const date=/^\d{4}-\d{2}-\d{2}$/;
export class DailyReportDto{
 @IsString() @MinLength(1) sucursalId!:string;
 /** Omit for "today" in Guatemala's wall clock (America/Guatemala). */
 @IsOptional() @Matches(date) fecha?:string;
}
export class DailyReportExportDto extends DailyReportDto{
 @IsEnum(['XLSX','PDF']) format!:'XLSX'|'PDF';
}
