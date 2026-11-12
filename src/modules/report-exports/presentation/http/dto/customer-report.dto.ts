import {Type} from 'class-transformer';
import {IsBoolean,IsEnum,IsInt,IsOptional,IsString,Max,Min,MinLength} from 'class-validator';
export class CustomerReportDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsOptional() @Type(()=>Boolean) @IsBoolean() soloActivos?:boolean;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(2000) limite?:number;
}
export class CustomerReportExportDto extends CustomerReportDto{
 @IsEnum(['XLSX','PDF']) format!:'XLSX'|'PDF';
}
