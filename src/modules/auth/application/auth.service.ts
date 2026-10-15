import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityRepository } from './ports/identity.repository.js';
import { PasswordHasher, SessionTokens } from './ports/crypto.ports.js';
export interface Principal {
  id: string;
  email: string;
  nombre: string;
  sessionId: string;
  debeCambiarContrasena: boolean;
  versionAutorizacion: number;
}
const TTL = 7 * 24 * 60 * 60 * 1000;
@Injectable()
export class AuthService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly hash: PasswordHasher,
    private readonly jwt: SessionTokens,
  ) {}
  async login(
    emailInput: string,
    password: string,
    ip: string,
    userAgent: string | null,
  ) {
    const email = emailInput.trim().toLowerCase();
    if (await this.repo.loginBlocked(email, ip))
      throw new HttpException(
        'Demasiados intentos',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const user = await this.repo.account(email);
    if (
      !user ||
      !user.activo ||
      !(await this.hash.verify(user.hashContrasena, password))
    ) {
      await this.repo.loginFailed(email, ip);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.repo.touchLogin(user.id);
    const refreshToken = this.jwt.refreshToken(),
      expiration = new Date(Date.now() + TTL);
    const sessionId = await this.repo.createSession({
      usuarioId: user.id,
      hash: this.jwt.digest(refreshToken),
      expiraEn: expiration,
      ip,
      userAgent,
    });
    return {
      accessToken: await this.jwt.sign({
        userId: user.id,
        sessionId,
        authorizationVersion: user.versionAutorizacion,
      }),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      session: { id: sessionId, expiresAt: expiration.toISOString() },
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        debeCambiarContrasena: user.debeCambiarContrasena,
      },
    };
  }
  async authenticate(jwt: string): Promise<Principal> {
    const token = await this.jwt.verify(jwt),
      session = await this.repo.sessionById(token.sessionId);
    if (
      !session ||
      !session.activo ||
      session.revocadaEn ||
      session.expiraEn <= new Date() ||
      session.usuarioId !== token.userId ||
      session.versionAutorizacion !== token.authorizationVersion
    )
      throw new UnauthorizedException('Sesión inválida o revocada');
    return {
      id: session.usuarioId,
      email: session.email,
      nombre: session.nombre,
      sessionId: session.id,
      debeCambiarContrasena: session.debeCambiarContrasena,
      versionAutorizacion: session.versionAutorizacion,
    };
  }
  async refresh(value: string) {
    const hashed = this.jwt.digest(value),
      session = await this.repo.sessionByRefreshHash(hashed);
    if (
      !session ||
      !session.activo ||
      session.revocadaEn ||
      session.expiraEn <= new Date()
    )
      throw new UnauthorizedException('Refresh token inválido');
    const refreshToken = this.jwt.refreshToken();
    if (
      !(await this.repo.rotate(
        session.id,
        hashed,
        this.jwt.digest(refreshToken),
      ))
    )
      throw new UnauthorizedException('Refresh token reutilizado');
    return {
      accessToken: await this.jwt.sign({
        userId: session.usuarioId,
        sessionId: session.id,
        authorizationVersion: session.versionAutorizacion,
      }),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      session: { id: session.id, expiresAt: session.expiraEn.toISOString() },
      user: {
        id: session.usuarioId,
        email: session.email,
        nombre: session.nombre,
        debeCambiarContrasena: session.debeCambiarContrasena,
      },
    };
  }
  async logout(user: Principal) {
    await this.repo.revoke(user.sessionId, user.id);
  }
  async logoutAll(user: Principal) {
    await this.repo.revokeAll(user.id);
  }
  async me(user: Principal) {
    return {
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        debeCambiarContrasena: user.debeCambiarContrasena,
      },
      roles: await this.repo.roles(user.id),
    };
  }
  async capabilities(user: Principal, sucursalId: string | null) {
    return {
      sucursalId,
      permissions: await this.repo.capabilities(user.id, sucursalId),
    };
  }
  async changePassword(user: Principal, oldValue: string, newValue: string) {
    if (oldValue === newValue)
      throw new ConflictException('La nueva contraseña debe ser diferente');
    const account = await this.repo.account(user.email);
    if (!account || !(await this.hash.verify(account.hashContrasena, oldValue)))
      throw new UnauthorizedException('Contraseña actual incorrecta');
    await this.repo.changePasswordAndRevokeSessions(
      user.id,
      await this.hash.hash(newValue),
    );
  }
  async createUser(
    actor: Principal,
    input: { email: string; nombre: string; temporalPassword: string },
  ) {
    return this.repo.createUser({
      actorId: actor.id,
      email: input.email.trim().toLowerCase(),
      nombre: input.nombre.trim(),
      hash: await this.hash.hash(input.temporalPassword),
    });
  }
  async assignRole(
    actor: Principal,
    targetId: string,
    roleId: string,
    sucursalId: string | null,
  ) {
    if (actor.id === targetId)
      throw new ForbiddenException('No puede modificar sus propios roles');
    await this.repo.assignRole({
      actorId: actor.id,
      userId: targetId,
      roleId,
      sucursalId,
    });
  }
}
