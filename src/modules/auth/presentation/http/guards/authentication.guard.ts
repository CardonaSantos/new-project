import {CanActivate,ExecutionContext,ForbiddenException,Injectable,UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import type {Request} from 'express';
import {AuthService,type Principal} from '../../../application/auth.service.js';
@Injectable()
export class AuthenticationGuard implements CanActivate {
 constructor(private readonly reflector:Reflector,private readonly authService:AuthService){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const targets=[context.getHandler(),context.getClass()];
  if(this.reflector.getAllAndOverride<boolean>('auth:isPublic',targets))return true;
  const req=context.switchToHttp().getRequest<Request&{auth?:Principal}>();
  const match=/^Bearer\s+([^\s]+)$/i.exec(req.headers.authorization??'');
  if(!match)throw new UnauthorizedException('Token requerido');
  const user=await this.authService.authenticate(match[1]);
  const allow=this.reflector.getAllAndOverride<boolean>('auth:allowPasswordChange',targets);
  if(user.debeCambiarContrasena&&!allow)throw new ForbiddenException('Primero cambie la contraseña temporal');
  req.auth=user;
  return true;
 }
}
