import {Body,Controller,Get,Param,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {SupplyService} from '../../application/supply.service.js';
import {SupplyAvailabilityDto,SupplyCancelDto,SupplyKeyDto,SupplyQueryDto,SupplyReceiveDto,SupplyRequestDto,SupplySendDto,SupplyPurchaseDraftDto,SupplyImmediateDto} from './dto/supply.dto.js';

@Controller('supply/requisitions')
export class SupplyRequisitionsController{
 constructor(private readonly store:SupplyService){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:SupplyQueryDto){return this.store.list(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:SupplyRequestDto){return this.store.create(u,d);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.store.detail(u,id);}
 @Get(':id/availability') availability(@CurrentUser() u:Principal,@Param('id') id:string,
  @Query() q:SupplyAvailabilityDto){return this.store.availability(u,id,q);}
 @Post(':id/purchase-draft') purchaseDraft(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:SupplyPurchaseDraftDto){return this.store.purchaseDraft(u,id,d);}
 @Post(':id/send') send(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:SupplySendDto){
  return this.store.send(u,id,d);
 }
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:SupplyCancelDto){
  return this.store.cancel(u,id,d);
 }
}
@Controller('supply/transfers')
export class SupplyTransfersController{
 constructor(private readonly store:SupplyService){}
 @Post('immediate') immediate(@CurrentUser() u:Principal,@Body() d:SupplyImmediateDto){
  return this.store.immediate(u,d);
 }
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.store.transfer(u,id);}
 @Post(':id/receive') receive(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:SupplyReceiveDto){
  return this.store.receive(u,id,d);
 }
}
