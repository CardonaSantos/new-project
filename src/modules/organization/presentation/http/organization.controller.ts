import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { Principal } from '../../../auth/application/auth.service.js';
import {
  CurrentUser,
  RequirePermissions,
} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import { OrganizationService } from '../../application/organization.service.js';
import { UpdateCompanyDto } from './dto/organization.dto.js';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}
  @Get()
  @RequirePermissions('organization.read')
  company(@CurrentUser() actor: Principal) {
    return this.service.company(actor);
  }
  @Patch()
  @RequirePermissions('organization.manage')
  update(@CurrentUser() actor: Principal, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompany(actor, dto);
  }
  @Get('capabilities')
  @RequirePermissions('organization.read')
  capabilities(@CurrentUser() actor: Principal) {
    return this.service.company(actor).then((company) => ({
      companyId: company.id,
      valuationMethods: ['PROMEDIO_PONDERADO', 'FIFO'],
      currencies: [company.moneda],
      supportsMultipleBranches: true,
      multiTenant: false,
    }));
  }
}
