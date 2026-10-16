import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {RecipeService} from '../../application/recipe.service.js';
import {CreateRecipeDto,UpdateRecipeDto,VersionDto,ListRecipesDto,PreviewDto,
 ModifierCompositionDto,PackagingRuleDto,PackagingQueryDto,ExecuteProductionDto,ListProductionsDto} from './dto/recipe.dto.js';
@Controller('recipes')
export class RecipesController{
 constructor(private readonly s:RecipeService){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:ListRecipesDto){return this.s.list(u,q);}
 @Get('options') options(@CurrentUser() u:Principal,@Query() q:ListRecipesDto){return this.s.options(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:CreateRecipeDto){return this.s.create(u,d);}
 @Get('reports/coverage') coverage(@CurrentUser() u:Principal){return this.s.coverage(u);}
 @Get('modifiers/:id/components') modifier(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.modifier(u,id);}
 @Put('modifiers/:id/components') setModifier(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:ModifierCompositionDto){return this.s.setModifier(u,id,d);}
 @Get('packaging') packaging(@CurrentUser() u:Principal,@Query() q:PackagingQueryDto){
  return this.s.packaging(u,q);}
 @Post('packaging') createPackaging(@CurrentUser() u:Principal,@Body() d:PackagingRuleDto){
  return this.s.createPackaging(u,d);}
 @Get('versions/:id/preview') preview(@CurrentUser() u:Principal,@Param('id') id:string,
  @Query() q:PreviewDto){return this.s.preview(u,id,q);}
 @Put('versions/:id') revise(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:VersionDto){return this.s.revise(u,id,d);}
 @Post('versions/:id/publish') publish(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.s.publish(u,id);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.detail(u,id);}
 @Patch(':id') update(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:UpdateRecipeDto){
  return this.s.update(u,id,d);}
 @Post(':id/versions') newVersion(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:VersionDto){return this.s.newVersion(u,id,d);}
}
@Controller('production/batches')
export class ProductionController{
 constructor(private readonly s:RecipeService){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:ListProductionsDto){return this.s.productions(u,q);}
 @Post() draft(@CurrentUser() u:Principal,@Body() d:ExecuteProductionDto){return this.s.draft(u,d);}
 @Post('execute') execute(@CurrentUser() u:Principal,@Body() d:ExecuteProductionDto){return this.s.execute(u,d);}
 @Get('reports/summary') report(@CurrentUser() u:Principal,@Query() q:ListProductionsDto){
  return this.s.productionReport(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.production(u,id);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.s.confirm(u,id);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.s.cancel(u,id);}
}
