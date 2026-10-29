import {Body,Controller,Get,Param,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../auth/application/auth.service.js';
import {FinanceStore} from './finance.store.js';
import {FinanceAccountCreateDto,FinanceAccountQueryDto,FinanceMovementQueryDto,
 FinanceOperationIntentDto,FinanceExpenseCreateDto,FinanceExpenseQueryDto,
 FinanceExternalPendingQueryDto,FinanceExternalPostDto} from './finance.dto.js';

@Controller('finance/operation-intents')
export class FinanceIntentsController{
 constructor(private readonly store:FinanceStore){}
 @Post() issue(@CurrentUser() u:Principal,@Body() d:FinanceOperationIntentDto){
  return this.store.issueIntent(u,d);
 }
}
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
@Controller('finance/expenses')
export class FinanceExpensesController{
 constructor(private readonly store:FinanceStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:FinanceExpenseQueryDto){
  return this.store.expenses(u,q);
 }
 @Post() create(@CurrentUser() u:Principal,@Body() d:FinanceExpenseCreateDto){
  return this.store.createExpense(u,d);
 }
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.store.expense(u,id);
 }
}

@Controller('finance/reconciliation')
export class FinanceReconciliationController{
 constructor(private readonly store:FinanceStore){}
 @Get('pending') pending(@CurrentUser() u:Principal,@Query() q:FinanceExternalPendingQueryDto){
  return this.store.pendingExternal(u,q);
 }
 @Post('post') post(@CurrentUser() u:Principal,@Body() d:FinanceExternalPostDto){
  return this.store.postExternal(u,d);
 }
}
