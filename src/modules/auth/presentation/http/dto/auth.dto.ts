import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) password!: string;
}
export class ChangePasswordDto {
  @IsString() oldPassword!: string;
  @IsString() @MinLength(12) @MaxLength(256) newPassword!: string;
}
export class CapabilitiesDto {
  @IsOptional() @IsString() sucursalId?: string;
}
export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(100) nombre!: string;
  @IsString() @MinLength(12) @MaxLength(256) temporalPassword!: string;
}
export class AssignRoleDto {
  @IsString() roleId!: string;
  @IsOptional() @IsString() sucursalId?: string;
}
