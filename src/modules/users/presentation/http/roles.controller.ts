import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import {CurrentUser,RequirePermissions} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {UsersService} from '../../application/users.service.js';
import {CreateRoleDto,RoleFilterDto,RolePermissionsDto,UpdateRoleDto} from './dto/users.dto.js';

@Controller('roles')
export class RolesController {
 constructor(private readonly users:UsersService){}
 @Get('options')
 @RequirePermissions('roles.read')
 options(@CurrentUser() user:Principal){return this.users.roleOptions(user);}
 @Get()
 @RequirePermissions('roles.read')
 list(@CurrentUser() user:Principal,@Query() dto:RoleFilterDto){return this.users.roles(user,dto);}
 @Get(':id')
 @RequirePermissions('roles.read')
 get(@CurrentUser() user:Principal,@Param('id') id:string){return this.users.role(user,id);}
 @Post()
 @RequirePermissions('roles.manage')
 create(@CurrentUser() user:Principal,@Body() dto:CreateRoleDto){return this.users.createRole(user,dto);}
 @Patch(':id')
 @RequirePermissions('roles.manage')
 update(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:UpdateRoleDto){
  return this.users.updateRole(user,id,dto);
 }
 @Put(':id/permissions')
 @RequirePermissions('roles.manage')
 permissions(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:RolePermissionsDto){
  return this.users.replaceRolePermissions(user,id,dto.permisos);
 }
}
@Controller('permissions')
export class PermissionsController {
 constructor(private readonly users:UsersService){}
 @Get()
 @RequirePermissions('roles.read')
 list(@CurrentUser() actor:Principal){return this.users.permissions(actor);}
}
