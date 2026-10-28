import {Body,Controller,Get,Param,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../auth/application/auth.service.js';
import {FinanceStore} from './finance.store.js';
import {FinanceAccountCreateDto,FinanceAccountQueryDto,FinanceMovementQueryDto} from './finance.dto.js';

@Controller('finance/accounts')
export class FinanceAccountsController{
 constructor(private readonly store:FinanceStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:FinanceAccountQueryDto){
  return this.store.accounts(u,q);
 }
 @Post() create(@CurrentUser() u:Principal,@Body() d:FinanceAccountCreateDto){
  return this.store.createAccount(u,d);
 }
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.store.account(u,id);
 }
 @Get(':id/movements') movements(@CurrentUser() u:Principal,@Param('id') id:string,
  @Query() q:FinanceMovementQueryDto){
  return this.store.movements(u,id,q);
 }
}
