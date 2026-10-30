import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsEmail,IsEnum,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateIf,IsISO8601} from 'class-validator';
const key=/^[A-Za-z0-9][A-Za-z0-9:_.-]{5,119}$/;
// Explicit offset is mandatory; the server timezone must never shift reservations.
const timezone=/(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const states=['PENDIENTE','CONFIRMADA','CANCELADA','COMPLETADA','NO_ASISTIO'] as const;
export class AvailabilityDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsISO8601({strict:true}) @Matches(timezone) inicio!:string;
 @IsISO8601({strict:true}) @Matches(timezone) fin!:string;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) personas!:number;
}
export class ReservationListDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsOptional() @IsISO8601({strict:true}) @Matches(timezone) desde?:string;
 @IsOptional() @IsISO8601({strict:true}) @Matches(timezone) hasta?:string;
 @IsOptional() @IsEnum(states) estado?:typeof states[number];
 @IsOptional() @IsString() @MaxLength(120) search?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
}
export class ReservationCreateDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @IsString() @MinLength(2) @MaxLength(180) nombreContacto!:string;
 @IsOptional() @IsString() @MaxLength(45) telefonoContacto?:string|null;
 @IsOptional() @ValidateIf((_o,v)=>v!==null) @IsEmail() @MaxLength(254) emailContacto?:string|null;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) personas!:number;
 @IsISO8601({strict:true}) @Matches(timezone) inicio!:string;
 @IsISO8601({strict:true}) @Matches(timezone) fin!:string;
 @IsOptional() @IsString() clienteId?:string|null;
 @IsOptional() @IsString() @MaxLength(1000) notas?:string|null;
 @IsOptional() @IsEnum(['PENDIENTE','CONFIRMADA']) estadoInicial?:'PENDIENTE'|'CONFIRMADA';
 @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @ArrayUnique() @IsString({each:true}) mesaIds?:string[];
 @IsString() @Matches(key) claveOperacion!:string;
}
export class ReservationUpdateDto{
 @IsOptional() @IsString() @MinLength(2) @MaxLength(180) nombreContacto?:string;
 @IsOptional() @IsString() @MaxLength(45) telefonoContacto?:string|null;
 @IsOptional() @ValidateIf((_o,v)=>v!==null) @IsEmail() @MaxLength(254) emailContacto?:string|null;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) personas?:number;
 @IsOptional() @IsISO8601({strict:true}) @Matches(timezone) inicio?:string;
 @IsOptional() @IsISO8601({strict:true}) @Matches(timezone) fin?:string;
 @IsOptional() @IsString() clienteId?:string|null;
 @IsOptional() @IsString() @MaxLength(1000) notas?:string|null;
 @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @ArrayUnique() @IsString({each:true}) mesaIds?:string[];
}
export class ReservationReasonDto{
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
}
