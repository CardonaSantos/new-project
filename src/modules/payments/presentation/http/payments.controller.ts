
import {Body,Controller,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CashStore} from '../../infrastructure/prisma/cash.store.js';
import {PaymentsStore} from '../../infrastructure/prisma/payments.store.js';
import {BranchDto,PageDto,RegisterDto,RegisterPatchDto,ShiftOpenDto,ShiftCloseDto,
 ShiftMovementDto,CollectDto,ConfirmAttemptDto,RefundDto,SplitDto,EqualSplitDto}
 from './dto/payments.dto.js';
@Controller('cash')
export class CashController{
 constructor(private readonly cash:CashStore){}
 @Get('registers') registers(@CurrentUser() u:Principal,@Query() q:BranchDto){
  return this.cash.registers(u,q.sucursalId);}
 @Post('registers') create(@CurrentUser() u:Principal,@Body() d:RegisterDto){return this.cash.create(u,d);}
 @Patch('registers/:id') update(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:RegisterPatchDto){return this.cash.update(u,id,d);}
 @Get('shifts') list(@CurrentUser() u:Principal,@Query() q:PageDto){return this.cash.list(u,q);}
 @Post('shifts') open(@CurrentUser() u:Principal,@Body() d:ShiftOpenDto){return this.cash.open(u,d);}
 @Get('shifts/:id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.cash.detail(u,id);}
 @Post('shifts/:id/movements') movement(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:ShiftMovementDto){return this.cash.movement(u,id,d);}
 @Post('shifts/:id/close') close(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:ShiftCloseDto){return this.cash.close(u,id,d);}
}
@Controller('accounts')
export class AccountsController{
 constructor(private readonly payments:PaymentsStore){}
 @Get('order/:orderId') accounts(@CurrentUser() u:Principal,@Param('orderId') id:string){
  return this.payments.accounts(u,id);}
 @Post('order/:orderId/finalize') finalize(@CurrentUser() u:Principal,
  @Param('orderId') id:string){return this.payments.finalize(u,id);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.payments.account(u,id);}
 @Post(':id/payments') collect(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:CollectDto){return this.payments.collect(u,id,d);}
 @Post('order/:orderId/split') split(@CurrentUser() u:Principal,@Param('orderId') id:string,
  @Body() d:SplitDto){return this.payments.split(u,id,d);}
 @Post('order/:orderId/split-equal') splitEqual(@CurrentUser() u:Principal,
  @Param('orderId') id:string,@Body() d:EqualSplitDto){return this.payments.splitEqual(u,id,d);}
}
@Controller('payment-attempts')
export class AttemptsController{
 constructor(private readonly payments:PaymentsStore){}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:ConfirmAttemptDto){return this.payments.confirm(u,id,d);}
}
@Controller('payments')
export class PaymentsController{
 constructor(private readonly payments:PaymentsStore){}
 @Post(':id/refund') refund(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:RefundDto){return this.payments.refund(u,id,d);}
}
@Controller('sales')
export class SalesController{
 constructor(private readonly payments:PaymentsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:PageDto){return this.payments.sales(u,q);}
}
