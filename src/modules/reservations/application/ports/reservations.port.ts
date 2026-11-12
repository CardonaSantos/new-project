import type {Principal} from '../../../auth/application/auth.service.js';
import type {AvailabilityDto,ReservationCreateDto,ReservationListDto,ReservationUpdateDto,ReservationReasonDto,ReminderListDto,ReminderActionDto} from '../../presentation/http/dto/reservations.dto.js';
export abstract class ReservationsPort{
 abstract availability(actor:Principal,q:AvailabilityDto):Promise<unknown>;
 abstract list(actor:Principal,q:ReservationListDto):Promise<unknown>;
 abstract detail(actor:Principal,id:string):Promise<unknown>;
 abstract create(actor:Principal,d:ReservationCreateDto):Promise<unknown>;
 abstract update(actor:Principal,id:string,d:ReservationUpdateDto):Promise<unknown>;
 abstract confirm(actor:Principal,id:string):Promise<unknown>;
 abstract cancel(actor:Principal,id:string,d:ReservationReasonDto):Promise<unknown>;
 abstract noShow(actor:Principal,id:string,d:ReservationReasonDto):Promise<unknown>;
 abstract checkIn(actor:Principal,id:string):Promise<unknown>;
 abstract reminders(actor:Principal,q:ReminderListDto):Promise<unknown>;
 abstract reminderAction(actor:Principal,id:string,d:ReminderActionDto):Promise<unknown>;
}
