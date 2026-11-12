import {ArrayMaxSize,ArrayMinSize,IsArray,IsDateString,IsOptional,IsString,
 Matches,MaxLength,MinLength,ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
// Mirrors the quantity format enforced in orders/presentation/http/dto/orders.dto.ts.
const Q=/^(?!0(?:\.0{1,3})?$)(?:0|[1-9]\d{0,13})(?:\.\d{1,3})?$/;

export class SelfServiceAccessDto{
 @IsString() @MinLength(10) @MaxLength(200) token!:string;
}
export class SelfServiceModifierDto{
 @IsString() modificadorId!:string;
}
export class SelfServiceItemDto{
 @IsString() varianteId!:string;
 @IsString() @Matches(Q) cantidad!:string;
 @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({each:true})
 @Type(()=>SelfServiceModifierDto) modificadores?:SelfServiceModifierDto[];
 @IsOptional() @IsString() @MaxLength(300) notasCocina?:string;
}
export class SelfServiceAddItemsDto{
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({each:true})
 @Type(()=>SelfServiceItemDto) lineas!:SelfServiceItemDto[];
}
export class IssueTableQrDto{
 @IsOptional() @IsDateString() expiraEn?:string;
}
