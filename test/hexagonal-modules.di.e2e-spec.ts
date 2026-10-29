import {describe,expect,it} from 'vitest';
import {ConfigModule} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service.js';
import {OrdersModule} from '../src/modules/orders/orders.module.js';
import {FinanceModule} from '../src/modules/finance/finance.module.js';
import {SupplyModule} from '../src/modules/supply/supply.module.js';
import {PurchaseOrdersService} from '../src/modules/purchases/application/purchase-orders.service.js';
import {OrderService} from '../src/modules/orders/application/order.service.js';
import {KitchenService} from '../src/modules/orders/application/kitchen.service.js';
import {TableService} from '../src/modules/orders/application/table.service.js';
import {CashService} from '../src/modules/payments/application/cash.service.js';
import {PaymentsService} from '../src/modules/payments/application/payments.service.js';
import {RecipeService} from '../src/modules/recipes/application/recipe.service.js';
import {InventoryOperationsService} from '../src/modules/inventory/application/inventory-operations.service.js';
import {FinanceService} from '../src/modules/finance/application/finance.service.js';
import {SupplyService} from '../src/modules/supply/application/supply.service.js';
import {SessionTokens} from '../src/modules/auth/application/ports/crypto.ports.js';
import {SpacesSettings} from '../src/modules/media/infrastructure/storage/spaces.settings.js';
import {FileStoragePort} from '../src/modules/media/application/ports/file-storage.port.js';

describe('Cross-context NestJS hexagonal dependency injection',()=>{
 it('resolves all public application services with real module boundaries',async()=>{
  const module=await Test.createTestingModule({
   imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true}),OrdersModule,FinanceModule,SupplyModule],
  })
  .overrideProvider(PrismaService).useValue({})
  .overrideProvider(SessionTokens).useValue({})
  .overrideProvider(SpacesSettings).useValue({
   region:'us-east-1',endpoint:'https://example.invalid',key:'test',secret:'test',
   bucket:'test',cdnBase:'',prefix:'gastro-core',maxDirectBytes:100,maxVideoBytes:100,
  })
  .overrideProvider(FileStoragePort).useValue({})
  .compile();
  try{
   for(const service of [PurchaseOrdersService,OrderService,KitchenService,TableService,
    CashService,PaymentsService,RecipeService,InventoryOperationsService,
    FinanceService,SupplyService]){
    expect(module.get(service,{strict:false}),service.name).toBeInstanceOf(service);
   }
  }finally{await module.close();}
 });
});
