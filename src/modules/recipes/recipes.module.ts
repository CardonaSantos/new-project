import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {InventoryModule} from '../inventory/inventory.module.js';
import {RecipeService} from './application/recipe.service.js';
import {RecipeStore} from './infrastructure/prisma/recipe.store.js';
import {ProductionStore} from './infrastructure/prisma/production.store.js';
import {RecipesController,ProductionController} from './presentation/http/recipes.controller.js';
import {RecipeStorePort} from './application/ports/recipe.port.js';
import {ProductionStorePort} from './application/ports/production.port.js';
@Module({
 imports:[AuthModule,PrismaModule,InventoryModule],
 controllers:[RecipesController,ProductionController],
 providers:[RecipeService,RecipeStore,ProductionStore,
  {provide:RecipeStorePort,useExisting:RecipeStore},
  {provide:ProductionStorePort,useExisting:ProductionStore}],
 exports:[RecipeService,ProductionStore,RecipeStorePort,ProductionStorePort]
})
export class RecipesModule{}
