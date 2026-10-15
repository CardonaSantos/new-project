import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import {CurrentUser,RequirePermissions} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {UsersService} from '../../application/users.service.js';
import {
 UserFilterDto,UserOptionDto,BranchQueryDto,CreateUserDto,UpdateUserDto,
 SetStatusDto,AvatarDto,AssignmentDto,AssignmentsDto,PageDto,UserActivityDto,UserRangeDto
} from './dto/users.dto.js';

@Controller('users')
export class UsersController {
 constructor(private readonly service:UsersService){}
 @Get('options')
 options(@CurrentUser() user:Principal,@Query() q:UserOptionDto){
  return this.service.options(user,{...q,sucursalId:q.sucursalId??null});
 }
 @Get()
 list(@CurrentUser() user:Principal,@Query() q:UserFilterDto){return this.service.list(user,q);}
 @Post()
 @RequirePermissions('users.create')
 create(@CurrentUser() user:Principal,@Body() dto:CreateUserDto){return this.service.create(user,dto);}
 @Get(':id')
 detail(@CurrentUser() user:Principal,@Param('id') id:string,@Query() q:BranchQueryDto){
  return this.service.detail(user,id,q.sucursalId??null);
 }
 @Patch(':id')
 @RequirePermissions('users.update')
 update(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:UpdateUserDto){
  return this.service.update(user,id,dto);
 }
 @Patch(':id/status')
 @RequirePermissions('users.status.manage')
 status(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:SetStatusDto){
  return this.service.changeStatus(user,id,dto.activo,dto.motivo);
 }
 @Put(':id/avatar')
 @RequirePermissions('users.update')
 avatar(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:AvatarDto){
  return this.service.avatar(user,id,dto.mediaId);
 }
 @Get(':id/roles')
 async roles(@CurrentUser() user:Principal,@Param('id') id:string,@Query() q:BranchQueryDto){
  const data=await this.service.detail(user,id,q.sucursalId??null);
  return {data:data.access.assignments};
 }
 @Put(':id/roles')
 @RequirePermissions('users.roles.assign')
 replaceAssignments(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:AssignmentsDto){
  return this.service.assignments(user,id,dto.assignments);
 }
 @Post(':id/roles')
 @RequirePermissions('users.roles.assign')
 async addAssignment(@CurrentUser() user:Principal,@Param('id') id:string,@Body() dto:AssignmentDto){
  const detail=await this.service.detail(user,id,null);
  const combined=detail.access.assignments.map(x=>({rolId:x.rolId,sucursalId:x.sucursalId}));
  combined.push({rolId:dto.rolId,sucursalId:dto.sucursalId??null});
  return this.service.assignments(user,id,combined);
 }
 @Get(':id/audit')
 @RequirePermissions('users.audit.read')
 audit(@CurrentUser() user:Principal,@Param('id') id:string,@Query() q:PageDto,
  @Query('sucursalId') sucursalId?:string){return this.service.audit(user,id,sucursalId??null,q);}
 @Get(':id/overview')
 @RequirePermissions('users.reports.read')
 overview(@CurrentUser() user:Principal,@Param('id') id:string,@Query() q:UserRangeDto){
  return this.service.overview(user,id,q);
 }
 @Get(':id/activity')
 @RequirePermissions('users.reports.read')
 activity(@CurrentUser() user:Principal,@Param('id') id:string,@Query() q:UserActivityDto){
  return this.service.activityList(user,id,q);
 }
}
