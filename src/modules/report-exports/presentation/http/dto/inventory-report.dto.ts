import {Type} from 'class-transformer';
import {IsEnum,IsInt,IsOptional,IsString,Matches,Max,Min,MinLength} from 'class-validator';
const date=/^\d{4}-\d{2}-\d{2}$/;
export class InventoryReportDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsEnum(['DIA','SEMANA','MES','ANIO','PERSONALIZADO']) periodo!:'DIA'|'SEMANA'|'MES'|'ANIO'|'PERSONALIZADO';
 @IsOptional() @Matches(date) fecha?:string;
 @IsOptional() @Matches(date) desde?:string;
 @IsOptional() @Matches(date) hasta?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(2000) limite?:number;
}
export class InventoryReportExportDto extends InventoryReportDto{
 @IsEnum(['XLSX','PDF']) format!:'XLSX'|'PDF';
}
