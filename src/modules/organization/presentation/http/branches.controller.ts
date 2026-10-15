import {Body,Controller,Get,Param,Patch,Post,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser,RequirePermissions} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {OrganizationService} from '../../application/organization.service.js';
import {BranchFilterDto,ConfigDto,CreateBranchDto,OptionQueryDto,StatusDto,UpdateBranchDto} from './dto/organization.dto.js';

@Controller('branches')
export class BranchesController{
 constructor(private readonly service:OrganizationService){}
 @Get('my-access')
 myAccess(@CurrentUser() actor:Principal){return this.service.myAccess(actor);}
 @Get('options')
 options(@CurrentUser() actor:Principal,@Query() q:OptionQueryDto){
  return this.service.branchOptions(actor,q);
 }
 @Get()
 list(@CurrentUser() actor:Principal,@Query() q:BranchFilterDto){return this.service.branches(actor,q);}
 @Post()
 @RequirePermissions('branches.manage')
 create(@CurrentUser() actor:Principal,@Body() dto:CreateBranchDto){return this.service.createBranch(actor,dto);}
 @Get(':id')
 detail(@CurrentUser() actor:Principal,@Param('id') id:string){return this.service.branch(actor,id);}
 @Patch(':id')
 update(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() dto:UpdateBranchDto){
  return this.service.updateBranch(actor,id,dto);
 }
 @Patch(':id/status')
 status(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() dto:StatusDto){
  return this.service.status(actor,id,dto.activa,dto.motivo);
 }
 @Get(':id/config')
 config(@CurrentUser() actor:Principal,@Param('id') id:string){
  return this.service.config(actor,id);
 }
 @Patch(':id/config')
 updateConfig(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() dto:ConfigDto){
  return this.service.updateConfig(actor,id,dto);
 }
 @Get(':id/overview')
 overview(@CurrentUser() actor:Principal,@Param('id') id:string){
  return this.service.overview(actor,id);
 }
}
