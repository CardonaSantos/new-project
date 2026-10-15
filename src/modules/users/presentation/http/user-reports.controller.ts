import {Controller,Get,Query} from '@nestjs/common';
import {CurrentUser,RequirePermissions} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {UsersService} from '../../application/users.service.js';
import {UserReportDto} from './dto/users.dto.js';

@Controller('users/reports')
export class UserReportsController {
 constructor(private readonly users:UsersService){}
 @Get('summary')
 @RequirePermissions('users.reports.read')
 summary(@CurrentUser() user:Principal,@Query() q:UserReportDto){return this.users.report(user,q);}
}
