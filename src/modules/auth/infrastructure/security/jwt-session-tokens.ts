import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import {
  SessionTokens,
  type AccessClaims,
} from '../../application/ports/crypto.ports.js';
@Injectable()
export class JwtSessionTokens extends SessionTokens {
  private readonly secret: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  constructor(cfg: ConfigService) {
    super();
    const secret = cfg.get<string>('AUTH_ACCESS_SECRET') ?? '';
    if (Buffer.byteLength(secret) < 43)
      throw new Error(
        'AUTH_ACCESS_SECRET debe tener al menos 43 caracteres aleatorios',
      );
    this.secret = new TextEncoder().encode(secret);
    this.issuer = cfg.get<string>('AUTH_ACCESS_ISSUER') ?? 'gastro-core';
    this.audience = cfg.get<string>('AUTH_ACCESS_AUDIENCE') ?? 'gastro-ui';
  }
  sign(v: AccessClaims) {
    return new SignJWT({ sid: v.sessionId, av: v.authorizationVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(v.userId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.secret);
  }
  async verify(jwt: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(jwt, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !Number.isSafeInteger(payload.av)
      )
        throw Error('Invalid claims');
      return {
        userId: payload.sub,
        sessionId: payload.sid,
        authorizationVersion: payload.av as number,
      };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
  refreshToken() {
    return randomBytes(48).toString('base64url');
  }
  digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
