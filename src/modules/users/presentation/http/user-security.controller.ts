import {Body,Controller,Delete,Get,Param,Post} from '@nestjs/common';
import {CurrentUser,RequirePermissions} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {UsersService} from '../../application/users.service.js';
import {ReasonDto} from './dto/users.dto.js';
@Controller('users')
export class UserSecurityController {
 constructor(private readonly service:UsersService){}
 @Post(':id/password/reset')
 @RequirePermissions('users.password.reset')
 resetPassword(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() dto:ReasonDto){
  return this.service.resetPassword(actor,id,dto.motivo);
 }
 @Get(':id/sessions')
 @RequirePermissions('users.sessions.read')
 sessions(@CurrentUser() actor:Principal,@Param('id') id:string){
  return this.service.sessions(actor,id);
 }
 @Delete(':id/sessions')
 @RequirePermissions('users.sessions.revoke')
 revokeAll(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() dto:ReasonDto){
  return this.service.revokeSessions(actor,id,dto.motivo);
 }
 @Delete(':id/sessions/:sessionId')
 @RequirePermissions('users.sessions.revoke')
 revokeOne(@CurrentUser() actor:Principal,@Param('id') id:string,
  @Param('sessionId') sessionId:string,@Body() dto:ReasonDto){
  return this.service.revokeSessions(actor,id,dto.motivo,sessionId);
 }
}
