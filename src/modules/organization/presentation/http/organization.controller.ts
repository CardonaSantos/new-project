import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { Principal } from '../../../auth/application/auth.service.js';
import {
  CurrentUser,
  Public,
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
  /**
   * Branding is @Public() because the customer-facing QR menu renders with it
   * and those diners have no session. What it exposes — trade name, logo and
   * colors — is the identity already printed on the menu itself, unlike the
   * full company record above, which also carries nit/razonSocial and stays
   * behind organization.read.
   */
  @Public()
  @Get('branding')
  branding() {
    return this.service.branding();
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
