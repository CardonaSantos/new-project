import {createParamDecorator,ExecutionContext,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import type {SelfServiceSession} from '../../../application/contracts/self-service.types.js';

export const CurrentSelfServiceSession=createParamDecorator(
 (_unused:unknown,ctx:ExecutionContext):SelfServiceSession=>{
  const session=(ctx.switchToHttp().getRequest<Request>() as
   Request&{selfService?:SelfServiceSession}).selfService;
  if(!session)throw new UnauthorizedException();
  return session;
 },
);
