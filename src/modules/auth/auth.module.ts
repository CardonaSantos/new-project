import {Module} from '@nestjs/common';
import {APP_GUARD} from '@nestjs/core';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {AuthService} from './application/auth.service.js';
import {IdentityRepository} from './application/ports/identity.repository.js';
import {PasswordHasher,SessionTokens} from './application/ports/crypto.ports.js';
import {PrismaIdentityRepository} from './infrastructure/prisma/prisma-identity.repository.js';
import {Argon2Hasher} from './infrastructure/security/argon2-hasher.js';
import {JwtSessionTokens} from './infrastructure/security/jwt-session-tokens.js';
import {AuthenticationGuard} from './presentation/http/guards/authentication.guard.js';
import {PermissionsGuard} from './presentation/http/guards/permissions.guard.js';
import {AuthController} from './presentation/http/controllers/auth.controller.js';
import {UsersController} from './presentation/http/controllers/users.controller.js';
@Module({
 imports:[PrismaModule],
 controllers:[AuthController,UsersController],
 providers:[
  AuthService,
  {provide:IdentityRepository,useClass:PrismaIdentityRepository},
  {provide:PasswordHasher,useClass:Argon2Hasher},
  {provide:SessionTokens,useClass:JwtSessionTokens},
  {provide:APP_GUARD,useClass:AuthenticationGuard},
  {provide:APP_GUARD,useClass:PermissionsGuard},
 ],
 exports:[AuthService,IdentityRepository],
})
export class AuthModule {}
