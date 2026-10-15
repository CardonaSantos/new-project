import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module.js';
import { UsersService } from './application/users.service.js';
import { AvatarResolver } from './application/avatar-resolver.service.js';
import { UsersRepositoryPort } from './application/ports/users.repository.port.js';
import { UserActivityPort } from './application/ports/user-activity.port.js';
import { PrismaUsersRepository } from './infrastructure/prisma/prisma-users.repository.js';
import { PrismaUserActivityRepository } from './infrastructure/prisma/prisma-user-activity.repository.js';
import { UsersController } from './presentation/http/users.controller.js';
import { UserSecurityController } from './presentation/http/user-security.controller.js';
import {
  RolesController,
  PermissionsController,
} from './presentation/http/roles.controller.js';
import { UserReportsController } from './presentation/http/user-reports.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, MediaModule],
  controllers: [
    UserReportsController,
    UsersController,
    UserSecurityController,
    RolesController,
    PermissionsController,
  ],
  providers: [
    UsersService,
    AvatarResolver,
    { provide: UsersRepositoryPort, useClass: PrismaUsersRepository },
    { provide: UserActivityPort, useClass: PrismaUserActivityRepository },
  ],
  exports: [UsersService, UsersRepositoryPort],
})
export class UsersModule {}
