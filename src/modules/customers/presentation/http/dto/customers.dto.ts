import {Transform,Type} from 'class-transformer';
import {IsBoolean,IsEmail,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min,MinLength,ValidateIf} from 'class-validator';
const bool=(value:unknown)=>value==='true'?true:value==='false'?false:value;
const coordinate=/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,7})?$/;
export class CustomerBranchQueryDto{
 @IsString() @MinLength(1) sucursalId!:string;
}
export class CustomerListDto extends CustomerBranchQueryDto{
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @IsOptional() @IsString() @MaxLength(100) search?:string;
 @IsOptional() @Transform(({value})=>bool(value)) @IsBoolean() activo?:boolean;
}
export class CustomerMutationDto extends CustomerBranchQueryDto{
 @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9:_.-]{5,119}$/) claveOperacion!:string;
}
export class CreateCustomerDto extends CustomerMutationDto{
 @IsString() @MinLength(2) @MaxLength(180) nombre!:string;
 @IsOptional() @IsString() @MaxLength(40) nit?:string|null;
 @IsOptional() @IsString() @MaxLength(45) telefono?:string|null;
 @IsOptional() @IsEmail() @MaxLength(254) email?:string|null;
 @IsOptional() @IsString() @MaxLength(1000) notas?:string|null;
}
export class UpdateCustomerDto extends CustomerMutationDto{
 @IsOptional() @IsString() @MinLength(2) @MaxLength(180) nombre?:string;
 @IsOptional() @IsString() @MaxLength(40) nit?:string|null;
 @IsOptional() @IsString() @MaxLength(45) telefono?:string|null;
 @IsOptional() @IsEmail() @MaxLength(254) email?:string|null;
 @IsOptional() @IsString() @MaxLength(1000) notas?:string|null;
}
export class DeactivateCustomerDto extends CustomerMutationDto{
 @IsString() @MinLength(5) @MaxLength(500) motivo!:string;
}
export class CreateAddressDto extends CustomerMutationDto{
 @IsOptional() @IsString() @MaxLength(100) alias?:string|null;
 @IsString() @MinLength(5) @MaxLength(500) direccion!:string;
 @IsOptional() @IsString() @MaxLength(500) referencia?:string|null;
 @IsOptional() @IsString() @Matches(coordinate) latitud?:string|null;
 @IsOptional() @IsString() @Matches(coordinate) longitud?:string|null;
 @IsOptional() @IsBoolean() principal?:boolean;
}
export class UpdateAddressDto extends CustomerMutationDto{
 @IsOptional() @IsString() @MaxLength(100) alias?:string|null;
 @IsOptional() @IsString() @MinLength(5) @MaxLength(500) direccion?:string;
 @IsOptional() @IsString() @MaxLength(500) referencia?:string|null;
 @IsOptional() @IsString() @Matches(coordinate) latitud?:string|null;
 @IsOptional() @IsString() @Matches(coordinate) longitud?:string|null;
}
