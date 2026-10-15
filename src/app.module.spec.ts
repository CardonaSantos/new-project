import {describe,expect,it} from 'vitest';
import {MODULE_METADATA} from '@nestjs/common/constants';
import {AppModule} from './app.module.js';
import {UsersModule} from './modules/users/users.module.js';
import {AuthModule} from './modules/auth/auth.module.js';
import {MediaModule} from './modules/media/media.module.js';

describe('AppModule registration',()=>{
 it('registers user administration, authentication and media contexts',()=>{
  const imports=Reflect.getMetadata(MODULE_METADATA.IMPORTS,AppModule) as unknown[];
  expect(imports).toContain(UsersModule);
  expect(imports).toContain(AuthModule);
  expect(imports).toContain(MediaModule);
 });
});
