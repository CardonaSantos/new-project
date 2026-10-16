import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {RecipeStore} from '../infrastructure/prisma/recipe.store.js';
import {ProductionStore} from '../infrastructure/prisma/production.store.js';
import type {CreateRecipeDto,UpdateRecipeDto,VersionDto,ListRecipesDto,PreviewDto,
 ModifierCompositionDto,PackagingRuleDto,PackagingQueryDto,ExecuteProductionDto,ListProductionsDto} from '../presentation/http/dto/recipe.dto.js';
@Injectable()
export class RecipeService{
 constructor(private readonly recipes:RecipeStore,private readonly productionStore:ProductionStore){}
 list(u:Principal,d:ListRecipesDto){return this.recipes.list(u,d);}
 options(u:Principal,d:ListRecipesDto){return this.recipes.options(u,d);}
 detail(u:Principal,id:string){return this.recipes.detail(u,id);}
 create(u:Principal,d:CreateRecipeDto){return this.recipes.create(u,d);}
 update(u:Principal,id:string,d:UpdateRecipeDto){return this.recipes.update(u,id,d);}
 newVersion(u:Principal,id:string,d:VersionDto){return this.recipes.newVersion(u,id,d);}
 revise(u:Principal,id:string,d:VersionDto){return this.recipes.revise(u,id,d);}
 publish(u:Principal,id:string){return this.recipes.publish(u,id);}
 coverage(u:Principal){return this.recipes.coverage(u);}
 modifier(u:Principal,id:string){return this.recipes.modifier(u,id);}
 setModifier(u:Principal,id:string,d:ModifierCompositionDto){return this.recipes.setModifier(u,id,d);}
 packaging(u:Principal,d:PackagingQueryDto){return this.recipes.packaging(u,d);}
 createPackaging(u:Principal,d:PackagingRuleDto){return this.recipes.createPackaging(u,d);}
 preview(u:Principal,id:string,d:PreviewDto){return this.productionStore.preview(u,id,d);}
 productions(u:Principal,d:ListProductionsDto){return this.productionStore.list(u,d);}
 production(u:Principal,id:string){return this.productionStore.detail(u,id);}
 draft(u:Principal,d:ExecuteProductionDto){return this.productionStore.draft(u,d);}
 confirm(u:Principal,id:string){return this.productionStore.confirm(u,id);}
 execute(u:Principal,d:ExecuteProductionDto){return this.productionStore.execute(u,d);}
 cancel(u:Principal,id:string){return this.productionStore.cancel(u,id);}
 productionReport(u:Principal,d:ListProductionsDto){return this.productionStore.report(u,d);}
}
