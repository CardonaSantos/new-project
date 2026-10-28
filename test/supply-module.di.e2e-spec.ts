import {describe,expect,it} from 'vitest';
import {ConfigModule} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import {PrismaService} from '../src/infrastructure/database/prisma/prisma.service.js';
import {SupplyModule} from '../src/modules/supply/supply.module.js';
import {SupplyStore} from '../src/modules/supply/supply.store.js';
import {InventoryPostingEngine} from '../src/modules/inventory/infrastructure/prisma/inventory-posting.engine.js';
import {SessionTokens} from '../src/modules/auth/application/ports/crypto.ports.js';
import {SpacesSettings} from '../src/modules/media/infrastructure/storage/spaces.settings.js';
import {FileStoragePort} from '../src/modules/media/application/ports/file-storage.port.js';
describe('SUP-A dependency injection',()=>{
 it('resolves SUP-A and shared INV-B posting with actual NestJS module imports',async()=>{
  const testing=await Test.createTestingModule({
   imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true}),SupplyModule],
  })
  .overrideProvider(PrismaService).useValue({})
  .overrideProvider(SessionTokens).useValue({})
  .overrideProvider(SpacesSettings).useValue({
   region:'us-east-1',endpoint:'https://example.invalid',key:'test',
   secret:'test',bucket:'test',cdnBase:'',prefix:'gastro-core',
   maxDirectBytes:100,maxVideoBytes:100})
  .overrideProvider(FileStoragePort).useValue({})
  .compile();
  try{
   expect(testing.get(SupplyStore,{strict:false})).toBeInstanceOf(SupplyStore);
   expect(testing.get(InventoryPostingEngine,{strict:false})).toBeInstanceOf(InventoryPostingEngine);
  }finally{await testing.close();}
 });
});
