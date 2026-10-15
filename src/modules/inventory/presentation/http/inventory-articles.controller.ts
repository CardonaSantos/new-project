import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {InventoryService} from '../../application/inventory.service.js';
import {ArticleCreateDto,ArticleListDto,ArticleOptionsDto,ArticleUpdateDto,MediaIdsDto,StatusDto} from './dto/inventory.dto.js';
@Controller('inventory/articles')
export class InventoryArticlesController{
 constructor(private readonly service:InventoryService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:ArticleOptionsDto){return this.service.articleOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:ArticleListDto){return this.service.articles(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() dto:ArticleCreateDto){return this.service.createArticle(a,dto);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string){return this.service.article(a,id);}
 @Get(':id/dependencies') dependencies(@CurrentUser() a:Principal,@Param('id') id:string){
  return this.service.dependencies(a,id);
 }
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:ArticleUpdateDto){
  return this.service.updateArticle(a,id,dto);
 }
 @Patch(':id/status') status(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:StatusDto){
  return this.service.articleStatus(a,id,dto.activo,dto.motivo);
 }
 @Put(':id/media') media(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:MediaIdsDto){
  return this.service.articleMedia(a,id,dto.mediaIds);
 }
}
