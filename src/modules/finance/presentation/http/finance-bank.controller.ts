import {Body,Controller,Get,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {FinanceBankService} from '../../application/finance-bank.service.js';
import {BankQueryDto,BankImportDto,BankMatchDto,BankUnmatchDto,BankReverseDto} from './dto/finance-bank.dto.js';
@Controller('finance/bank-statements')
export class FinanceBankController{
 constructor(private readonly service:FinanceBankService){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:BankQueryDto){return this.service.list(u,q);}
 @Get('ledger-pending') unmatched(@CurrentUser() u:Principal,@Query() q:BankQueryDto){
  return this.service.unmatched(u,q);
 }
 @Post('import') importLines(@CurrentUser() u:Principal,@Body() d:BankImportDto){
  return this.service.importLines(u,d);
 }
 @Post('match') match(@CurrentUser() u:Principal,@Body() d:BankMatchDto){return this.service.match(u,d);}
 @Post('unmatch') unmatch(@CurrentUser() u:Principal,@Body() d:BankUnmatchDto){return this.service.unmatch(u,d);}
}
@Controller('finance/reversals')
export class FinanceReverseController{
 constructor(private readonly service:FinanceBankService){}
 @Post() reverse(@CurrentUser() u:Principal,@Body() d:BankReverseDto){
  return this.service.reverse(u,d);
 }
}
