import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  AuthService,
  type Principal,
} from '../../../application/auth.service.js';
import {
  CurrentUser,
  RequirePermissions,
} from '../decorators/auth.decorators.js';
import { AssignRoleDto, CreateUserDto } from '../dto/auth.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService) {}
  @Post()
  @RequirePermissions('users.create')
  create(@CurrentUser() actor: Principal, @Body() dto: CreateUserDto) {
    return this.auth.createUser(actor, dto);
  }
  @Post(':id/roles')
  @RequirePermissions('users.roles.assign')
  async assign(
    @CurrentUser() actor: Principal,
    @Param('id') targetId: string,
    @Body() dto: AssignRoleDto,
  ) {
    await this.auth.assignRole(
      actor,
      targetId,
      dto.roleId,
      dto.sucursalId ?? null,
    );
    return { ok: true };
  }
}
