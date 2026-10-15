import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {CurrentUser} from '../../auth/presentation/http/decorators/auth.decorators.js';
import {CatalogService} from '../application/catalog.service.js';
import {BranchQueryDto,MenuCreateDto,MenuLayoutDto,MenuListDto,MenuPatchDto,PublishDto} from './dto/catalog.dto.js';
@Controller('catalog/menus')
export class CatalogMenusController{
 constructor(private readonly service:CatalogService){}
 @Get() list(@CurrentUser() a:Principal,@Query() q:MenuListDto){
  return this.service.menus(a,q,q.sucursalId);
 }
 @Post() create(@CurrentUser() a:Principal,@Body() v:MenuCreateDto){return this.service.createMenu(a,v);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string){return this.service.menu(a,id);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:MenuPatchDto){
  return this.service.updateMenu(a,id,v);
 }
 @Put(':id/layout') layout(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:MenuLayoutDto){
  return this.service.layout(a,id,v);
 }
 @Post(':id/publish') publish(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:PublishDto){
  return this.service.publish(a,id,v.expectedVersion);
 }
 @Post(':id/unpublish') unpublish(@CurrentUser() a:Principal,@Param('id') id:string){
  return this.service.unpublish(a,id);
 }
}
@Controller('catalog/menu')
export class CatalogMenuProjectionController{
 constructor(private readonly service:CatalogService){}
 @Get() get(@CurrentUser() a:Principal,@Query() q:PriceQueryDto){
  return this.service.branchMenu(a,q.sucursalId,q.fecha);
 }
}
