import {Body,Controller,Get,Header,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {DeliveryService} from '../../application/delivery.service.js';
import {DeliveryAssignDto,DeliveryCancelDto,DeliveryCreateDto,DeliveryDestinationDto,
 DeliveryKeyDto,DeliveryListDto} from './dto/delivery.dto.js';

@Controller('deliveries')
export class DeliveryController{
 constructor(private readonly delivery:DeliveryService){}
 @Get() @Header('Cache-Control','no-store')
 list(@CurrentUser() u:Principal,@Query() q:DeliveryListDto){return this.delivery.list(u,q);}
 @Post()
 create(@CurrentUser() u:Principal,@Body() d:DeliveryCreateDto){return this.delivery.create(u,d);}
 @Get(':id') @Header('Cache-Control','no-store')
 detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.delivery.detail(u,id);}
 @Get(':id/events') @Header('Cache-Control','no-store')
 events(@CurrentUser() u:Principal,@Param('id') id:string){return this.delivery.events(u,id);}
 @Patch(':id/destination')
 destination(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:DeliveryDestinationDto){
  return this.delivery.destination(u,id,d);
 }
 @Post(':id/assign')
 assign(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:DeliveryAssignDto){
  return this.delivery.assign(u,id,d);
 }
 @Post(':id/dispatch')
 dispatch(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:DeliveryKeyDto){
  return this.delivery.dispatch(u,id,d);
 }
 @Post(':id/complete')
 complete(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:DeliveryKeyDto){
  return this.delivery.complete(u,id,d);
 }
 @Post(':id/cancel')
 cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:DeliveryCancelDto){
  return this.delivery.cancel(u,id,d);
 }
}
