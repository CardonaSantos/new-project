import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {ReservationsPort} from './ports/reservations.port.js';
import type {AvailabilityDto,ReservationCreateDto,ReservationListDto,ReservationUpdateDto,ReservationReasonDto} from '../presentation/http/dto/reservations.dto.js';
@Injectable()
export class ReservationsService{
 constructor(private readonly port:ReservationsPort){}
 availability(u:Principal,q:AvailabilityDto){return this.port.availability(u,q);}
 list(u:Principal,q:ReservationListDto){return this.port.list(u,q);}
 detail(u:Principal,id:string){return this.port.detail(u,id);}
 create(u:Principal,d:ReservationCreateDto){return this.port.create(u,d);}
 update(u:Principal,id:string,d:ReservationUpdateDto){return this.port.update(u,id,d);}
 confirm(u:Principal,id:string){return this.port.confirm(u,id);}
 cancel(u:Principal,id:string,d:ReservationReasonDto){return this.port.cancel(u,id,d);}
 noShow(u:Principal,id:string,d:ReservationReasonDto){return this.port.noShow(u,id,d);}
 checkIn(u:Principal,id:string){return this.port.checkIn(u,id);}
}
