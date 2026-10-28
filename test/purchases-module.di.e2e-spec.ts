import {describe,expect,it} from 'vitest';
import {ConfigModule} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service.js';
import {PurchasesModule} from '../src/modules/purchases/purchases.module.js';
import {PurchasePaymentsStore} from '../src/modules/purchases/infrastructure/prisma/purchase-payments.store.js';
import {PurchaseReturnsStore} from '../src/modules/purchases/infrastructure/prisma/purchase-returns.store.js';
import {CashStore} from '../src/modules/payments/infrastructure/prisma/cash.store.js';
import {SessionTokens} from '../src/modules/auth/application/ports/crypto.ports.js';
import {SpacesSettings} from '../src/modules/media/infrastructure/storage/spaces.settings.js';
import {FileStoragePort} from '../src/modules/media/application/ports/file-storage.port.js';

describe('PUR-A module integration / real NestJS dependency injection',()=>{
 it('resolves both purchases payment and refunds services from the PAY-A exported cash provider',async()=>{
  // Real imported Nest modules; only external infrastructure is mocked.
  // Avoids a PostgreSQL, external S3 or secret dependency in the DI smoke test.
  const module=await Test.createTestingModule({
   imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true}),PurchasesModule],
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
   expect(module.get(PurchasePaymentsStore,{strict:false})).toBeInstanceOf(PurchasePaymentsStore);
   expect(module.get(PurchaseReturnsStore,{strict:false})).toBeInstanceOf(PurchaseReturnsStore);
   expect(module.get(CashStore,{strict:false})).toBeInstanceOf(CashStore);
  }finally{
   await module.close();
  }
 });
});
