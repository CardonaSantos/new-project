import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../../auth/application/auth.service.js';
import { CurrentUser } from '../../../auth/presentation/http/decorators/auth.decorators.js';
import { OrganizationService } from '../../application/organization.service.js';
import {
  CreateDeviceDto,
  DeviceFilterDto,
  DeviceOptionDto,
  StatusDto,
  UpdateDeviceDto,
} from './dto/organization.dto.js';

@Controller('devices')
export class DevicesController {
  constructor(private readonly service: OrganizationService) {}
  @Get('options')
  options(@CurrentUser() actor: Principal, @Query() q: DeviceOptionDto) {
    return this.service.deviceOptions(actor, q);
  }
  @Get()
  list(@CurrentUser() actor: Principal, @Query() q: DeviceFilterDto) {
    return this.service.devices(actor, q);
  }
  @Post()
  create(@CurrentUser() actor: Principal, @Body() dto: CreateDeviceDto) {
    return this.service.createDevice(actor, dto);
  }
  @Get(':id')
  detail(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.service.device(actor, id);
  }
  @Patch(':id')
  update(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.service.updateDevice(actor, id, dto);
  }
  @Patch(':id/status')
  status(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: StatusDto,
  ) {
    return this.service.deviceStatus(actor, id, dto.activa, dto.motivo);
  }
}
