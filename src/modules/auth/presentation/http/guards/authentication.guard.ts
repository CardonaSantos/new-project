import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Socket } from 'socket.io';
import {
  AuthService,
  type Principal,
} from '../../../application/auth.service.js';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('auth:isPublic', targets))
      return true;
    // This guard is registered globally (APP_GUARD), so it also runs for every WS
    // @SubscribeMessage — there is no HTTP request to read a bearer token from there.
    // A gateway authenticates once at the socket handshake (see
    // RealtimeGateway.handleConnection) and stashes the result on client.data.auth;
    // per-message checks here just read that back instead of re-parsing headers.
    if (context.getType() === 'ws') {
      const client = context
        .switchToWs()
        .getClient<Socket & { data: { auth?: Principal } }>();
      if (!client.data?.auth) throw new UnauthorizedException('Token requerido');
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<Request & { auth?: Principal }>();
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Token requerido');
    const user = await this.authService.authenticate(match[1]);
    const allow = this.reflector.getAllAndOverride<boolean>(
      'auth:allowPasswordChange',
      targets,
    );
    if (user.debeCambiarContrasena && !allow)
      throw new ForbiddenException('Primero cambie la contraseña temporal');
    req.auth = user;
    return true;
  }
}
