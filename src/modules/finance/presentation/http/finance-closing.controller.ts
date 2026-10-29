import {Body,Controller,Get,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {FinanceClosingService} from '../../application/finance-closing.service.js';
import {ClosePreviewDto,CloseConfirmDto} from './dto/finance-closing.dto.js';
@Controller('finance/closing')
export class FinanceClosingController{
 constructor(private readonly service:FinanceClosingService){}
 @Get('preview') preview(@CurrentUser() u:Principal,@Query() d:ClosePreviewDto){
  return this.service.preview(u,d);
 }
 @Get() detail(@CurrentUser() u:Principal,@Query() d:ClosePreviewDto){
  return this.service.detail(u,d.sucursalId,d.fechaOperativa);
 }
 @Post() close(@CurrentUser() u:Principal,@Body() d:CloseConfirmDto){
  return this.service.confirm(u,d);
 }
}
