import {Body,Controller,Get,HttpCode,Param,Patch,Post,Put,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {CatalogService} from '../../application/catalog.service.js';
import {AttachGroupsDto,GroupCreateDto,GroupPatchDto,ModifierCreateDto,ModifierListDto,
 ModifierPatchDto,OptionsDto,PageDto,PriceCreateDto,PriceQueryDto,QuoteDto} from './dto/catalog.dto.js';
@Controller('catalog/modifier-groups')
export class CatalogGroupsController{
 constructor(private readonly service:CatalogService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:OptionsDto){return this.service.groupOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:PageDto){return this.service.groups(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() v:GroupCreateDto){return this.service.createGroup(a,v);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:GroupPatchDto){
  return this.service.updateGroup(a,id,v);
 }
}
@Controller('catalog/modifiers')
export class CatalogModifiersController{
 constructor(private readonly service:CatalogService){}
 @Get() list(@CurrentUser() a:Principal,@Query() q:ModifierListDto){return this.service.modifiers(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() v:ModifierCreateDto){return this.service.createModifier(a,v);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:ModifierPatchDto){
  return this.service.updateModifier(a,id,v);
 }
}
@Controller('catalog/variants')
export class CatalogVariantGroupsController{
 constructor(private readonly service:CatalogService){}
 @Put(':id/modifier-groups') groups(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:AttachGroupsDto){
  return this.service.attachGroups(a,id,v.grupos);
 }
}
@Controller('catalog/prices')
export class CatalogPricesController{
 constructor(private readonly service:CatalogService){}
 @Post('variants') addVariant(@CurrentUser() a:Principal,@Body() v:PriceCreateDto){
  return this.service.createPrice(a,'variant',v);
 }
 @Post('modifiers') addModifier(@CurrentUser() a:Principal,@Body() v:PriceCreateDto){
  return this.service.createPrice(a,'modifier',v);
 }
 @Get('variants/:id/history') variants(@CurrentUser() a:Principal,@Param('id') id:string,@Query() q:PriceQueryDto){
  return this.service.priceHistory(a,'variant',id,q.sucursalId);
 }
 @Get('modifiers/:id/history') modifiers(@CurrentUser() a:Principal,@Param('id') id:string,@Query() q:PriceQueryDto){
  return this.service.priceHistory(a,'modifier',id,q.sucursalId);
 }
 @Get('variants/:id/resolve') resolve(@CurrentUser() a:Principal,@Param('id') id:string,@Query() q:PriceQueryDto){
  return this.service.price(a,id,q.sucursalId,q.fecha);
 }
 @Post('quote') @HttpCode(200) quote(@CurrentUser() a:Principal,@Body() v:QuoteDto){
  return this.service.quote(a,v.varianteId,v.sucursalId,v.modificadorIds,v.fecha);
 }
}
