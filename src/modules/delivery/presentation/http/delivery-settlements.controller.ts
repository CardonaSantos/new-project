import {Body,Controller,Get,Header,Param,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DeliverySettlementsService} from '../../application/delivery-settlements.service.js';
import {CloseCourierSettlementDto,CreateCourierSettlementDto,CreatePlatformSettlementDto,
 CourierCashDto,SettlementBranchDto,SettlementPageDto} from './dto/delivery-settlements.dto.js';

@Controller('deliveries')
export class DeliverySettlementsController{
 constructor(private readonly svc:DeliverySettlementsService){}
 @Post(':id/collect-cash')
 collect(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:CourierCashDto){
  return this.svc.cash(u,id,d);
 }
 @Get('settlements/couriers/pending') @Header('Cache-Control','no-store')
 pending(@CurrentUser() u:Principal,@Query() d:SettlementPageDto){return this.svc.pending(u,d);}
 @Post('settlements/couriers')
 createCourier(@CurrentUser() u:Principal,@Body() d:CreateCourierSettlementDto){
  return this.svc.createCourier(u,d);
 }
 @Post('settlements/couriers/:id/close')
 closeCourier(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:CloseCourierSettlementDto){return this.svc.closeCourier(u,id,d);}
 @Get('settlements/couriers/:id') @Header('Cache-Control','no-store')
 courier(@CurrentUser() u:Principal,@Param('id') id:string){return this.svc.courierDetail(u,id);}
 @Get('settlements/platforms/channels') @Header('Cache-Control','no-store')
 channels(@CurrentUser() u:Principal,@Query() d:SettlementBranchDto){
  return this.svc.platformChannels(u,d.sucursalId);
 }
 @Post('settlements/platforms')
 createPlatform(@CurrentUser() u:Principal,@Body() d:CreatePlatformSettlementDto){
  return this.svc.createPlatform(u,d);
 }
 @Get('settlements/platforms/:id') @Header('Cache-Control','no-store')
 platform(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.svc.platformDetail(u,id);
 }
}
