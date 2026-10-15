import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {CatalogService} from '../../application/catalog.service.js';
import {BranchQueryDto,BranchVariantDto,CategoryCreateDto,CategoryPatchDto,ImageIdsDto,
 OptionsDto,ProductCreateDto,ProductListDto,ProductOptionsDto,ProductPatchDto,StatusDto,
 VariantInputDto,VariantOptionDto,VariantPatchDto} from './dto/catalog.dto.js';

@Controller('catalog/categories')
export class CatalogCategoriesController{
 constructor(private readonly service:CatalogService){}
 @Get('tree') tree(@CurrentUser() a:Principal){return this.service.categoryTree(a);}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:OptionsDto){return this.service.categoryOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:import('./dto/catalog.dto.js').PageDto){return this.service.categories(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() v:CategoryCreateDto){return this.service.createCategory(a,v);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string){return this.service.category(a,id);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:CategoryPatchDto){
  return this.service.updateCategory(a,id,v);
 }
 @Patch(':id/status') status(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:StatusDto){
  return this.service.statusCategory(a,id,v.activo,v.motivo);
 }
 @Put(':id/media') media(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:ImageIdsDto){
  return this.service.replaceMedia(a,'category',id,v.mediaIds);
 }
}
@Controller('catalog/products')
export class CatalogProductsController{
 constructor(private readonly service:CatalogService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:ProductOptionsDto){return this.service.productOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:ProductListDto){return this.service.products(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() v:ProductCreateDto){return this.service.createProduct(a,v);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string,@Query() q:BranchQueryDto){
  return this.service.product(a,id,q.sucursalId);
 }
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:ProductPatchDto){
  return this.service.updateProduct(a,id,v);
 }
 @Patch(':id/status') status(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:StatusDto){
  return this.service.statusProduct(a,id,v.activo,v.motivo);
 }
 @Put(':id/media') media(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:ImageIdsDto){
  return this.service.replaceMedia(a,'product',id,v.mediaIds);
 }
 @Post(':id/variants') createVariant(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:VariantInputDto){
  return this.service.createVariant(a,id,v);
 }
 @Get(':id/readiness') readiness(@CurrentUser() a:Principal,@Param('id') id:string,@Query() q:BranchQueryDto){
  return this.service.readiness(a,id,q.sucursalId??'',q.fecha);
 }
}
@Controller('catalog/variants')
export class CatalogVariantsController{
 constructor(private readonly service:CatalogService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:VariantOptionDto){return this.service.variantOptions(a,q);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string,@Query() q:BranchQueryDto){
  return this.service.variant(a,id,q.sucursalId);
 }
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:VariantPatchDto){
  return this.service.updateVariant(a,id,v);
 }
 @Patch(':id/branch') branch(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:BranchVariantDto){
  return this.service.variantBranch(a,id,v.sucursalId,v);
 }
 @Put(':id/media') media(@CurrentUser() a:Principal,@Param('id') id:string,@Body() v:ImageIdsDto){
  return this.service.replaceMedia(a,'variant',id,v.mediaIds);
 }
}
