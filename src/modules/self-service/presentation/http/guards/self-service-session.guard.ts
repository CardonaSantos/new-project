import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import {SelfServicePort} from '../../../application/ports/self-service.repository.js';
import type {SelfServiceSession} from '../../../application/contracts/self-service.types.js';
import {digest} from '../../../infrastructure/security/token.util.js';

/** Guards every /self-service/* customer route EXCEPT /self-service/access.
 * Unrelated to the staff AuthenticationGuard: the bearer here is a session
 * secret minted by SelfServiceStore.access(), never a staff JWT. */
@Injectable()
export class SelfServiceSessionGuard implements CanActivate{
 constructor(private readonly port:SelfServicePort){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const req=context.switchToHttp().getRequest<Request&{selfService?:SelfServiceSession}>();
  const match=/^Bearer\s+([^\s]+)$/i.exec(req.headers.authorization??'');
  if(!match)throw new UnauthorizedException('Sesión de autoservicio requerida');
  const session=await this.port.resolveSession(digest(match[1]));
  if(!session)throw new UnauthorizedException('Sesión de autoservicio inválida o vencida');
  req.selfService=session;
  return true;
 }
}
