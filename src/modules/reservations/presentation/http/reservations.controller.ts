import {Body,Controller,Get,Header,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {ReservationsService} from '../../application/reservations.service.js';
import {AvailabilityDto,ReservationCreateDto,ReservationListDto,ReservationUpdateDto,ReservationReasonDto} from './dto/reservations.dto.js';
@Controller('reservations')
export class ReservationsController{
 constructor(private readonly reservations:ReservationsService){}
 @Get('availability') @Header('Cache-Control','no-store')
 availability(@CurrentUser() u:Principal,@Query() q:AvailabilityDto){return this.reservations.availability(u,q);}
 @Get() @Header('Cache-Control','no-store')
 list(@CurrentUser() u:Principal,@Query() q:ReservationListDto){return this.reservations.list(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:ReservationCreateDto){return this.reservations.create(u,d);}
 @Get(':id') @Header('Cache-Control','no-store')
 detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.reservations.detail(u,id);}
 @Patch(':id') update(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReservationUpdateDto){return this.reservations.update(u,id,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string){return this.reservations.confirm(u,id);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReservationReasonDto){return this.reservations.cancel(u,id,d);}
 @Post(':id/no-show') noShow(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReservationReasonDto){return this.reservations.noShow(u,id,d);}
 @Post(':id/check-in') checkIn(@CurrentUser() u:Principal,@Param('id') id:string){return this.reservations.checkIn(u,id);}
}
