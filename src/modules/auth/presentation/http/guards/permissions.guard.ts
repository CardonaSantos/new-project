import {CanActivate,ExecutionContext,ForbiddenException,Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import type {Request} from 'express';
import {IdentityRepository} from '../../../application/ports/identity.repository.js';
import type {Principal} from '../../../application/auth.service.js';
@Injectable()
export class PermissionsGuard implements CanActivate {
 constructor(private readonly reflector:Reflector,private readonly repo:IdentityRepository){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const required=this.reflector.getAllAndOverride<string[]>('auth:permissions',[context.getHandler(),context.getClass()]);
  if(!required?.length)return true;
  const req=context.switchToHttp().getRequest<Request&{auth?:Principal}>();
  if(!req.auth)throw new ForbiddenException('Autenticación requerida');
  // Header is a scope selector, NOT proof of authorization.
  const candidate=req.header('x-sucursal-id')??req.params?.['sucursalId']??null;
  const scope=typeof candidate==='string'?candidate:null;
  const available=await this.repo.capabilities(req.auth.id,scope);
  if(!required.every(code=>available.includes(code)))throw new ForbiddenException('Permiso insuficiente');
  return true;
 }
}
