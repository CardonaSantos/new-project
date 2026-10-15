import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {MediaModule} from '../media/media.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {CatalogService} from './application/catalog.service.js';
import {CatalogMediaService} from './application/catalog-media.service.js';
import {CatalogRepositoryPort} from './application/ports/catalog.repository.port.js';
import {CatalogCommercialStore} from './infrastructure/prisma/catalog-commercial.store.js';
import {CatalogPricingStore} from './infrastructure/prisma/catalog-pricing.store.js';
import {CatalogMenuStore} from './infrastructure/prisma/catalog-menu.store.js';
import {CatalogReportStore} from './infrastructure/prisma/catalog-report.store.js';
import {PrismaCatalogRepository} from './infrastructure/prisma/prisma-catalog.repository.js';
import {CatalogCategoriesController,CatalogProductsController,CatalogVariantsController} from './presentation/http/catalog-products.controller.js';
import {CatalogGroupsController,CatalogModifiersController,CatalogVariantGroupsController,CatalogPricesController} from './presentation/http/catalog-pricing.controller.js';
import {CatalogMenusController,CatalogMenuProjectionController} from './presentation/http/catalog-menus.controller.js';
import {CatalogReportsController} from './presentation/http/catalog-reports.controller.js';
@Module({
 imports:[AuthModule,PrismaModule,MediaModule],
 controllers:[CatalogCategoriesController,CatalogProductsController,CatalogVariantsController,
  CatalogGroupsController,CatalogModifiersController,CatalogVariantGroupsController,CatalogPricesController,
  CatalogMenusController,CatalogMenuProjectionController,CatalogReportsController],
 providers:[CatalogService,CatalogMediaService,
  CatalogCommercialStore,CatalogPricingStore,CatalogMenuStore,CatalogReportStore,
  {provide:CatalogRepositoryPort,useClass:PrismaCatalogRepository}],
 exports:[CatalogService,CatalogRepositoryPort]
})
export class CatalogModule{}
