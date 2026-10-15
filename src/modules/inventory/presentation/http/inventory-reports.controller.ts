import {Controller,Get,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {InventoryService} from '../../application/inventory.service.js';
import {MasterReportDto} from './dto/inventory.dto.js';
@Controller('inventory/reports')
export class InventoryReportsController{
 constructor(private readonly service:InventoryService){}
 @Get('masters')
 masters(@CurrentUser() actor:Principal,@Query() q:MasterReportDto){
  return this.service.overview(actor,q.sucursalId);
 }
}
