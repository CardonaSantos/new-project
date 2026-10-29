import {IsString,Matches,MinLength} from 'class-validator';
export class ClosePreviewDto{
 @IsString() @MinLength(1) sucursalId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaOperativa!:string;
}
export class CloseConfirmDto extends ClosePreviewDto{
 @Matches(/^FIN:[0-9a-f-]{36}$/) operationId!:string;
}
