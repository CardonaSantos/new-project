import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {validateEnvironment} from './config/env.validation.js';
import {CoreModule} from './modules/core/core.module.js';
import {AuthModule} from './modules/auth/auth.module.js';
import {MediaModule} from './modules/media/media.module.js';
@Module({
 imports:[
  ConfigModule.forRoot({isGlobal:true,cache:true,validate:validateEnvironment}),
  AuthModule,
  MediaModule,
  CoreModule,
 ],
})
export class AppModule {}
