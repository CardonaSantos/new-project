import {createParamDecorator,ExecutionContext,SetMetadata,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import type {Principal} from '../../../application/auth.service.js';
export const Public=()=>SetMetadata('auth:isPublic',true);
export const AllowPasswordChange=()=>SetMetadata('auth:allowPasswordChange',true);
export const RequirePermissions=(...codes:string[])=>SetMetadata('auth:permissions',codes);
export const CurrentUser=createParamDecorator((_unused:unknown,ctx:ExecutionContext):Principal=>{
 const user=(ctx.switchToHttp().getRequest<Request>() as Request&{auth?:Principal}).auth;
 if(!user)throw new UnauthorizedException();
 return user;
});
