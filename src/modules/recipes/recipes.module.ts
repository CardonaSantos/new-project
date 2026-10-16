import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {RecipeService} from './application/recipe.service.js';
import {RecipeStore} from './infrastructure/prisma/recipe.store.js';
import {ProductionStore} from './infrastructure/prisma/production.store.js';
import {RecipesController,ProductionController} from './presentation/http/recipes.controller.js';
@Module({
 imports:[AuthModule,PrismaModule,InventoryModule],
 controllers:[RecipesController,ProductionController],
 providers:[RecipeService,RecipeStore,ProductionStore],
 exports:[RecipeService,ProductionStore]
})
export class RecipesModule{}
