import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {PrismaModule} from '../../infrastructure/database/prisma/prisma.module.js';
import {OrganizationService} from './application/organization.service.js';
import {OrganizationRepositoryPort} from './application/ports/organization.repository.port.js';
import {PrismaOrganizationRepository} from './infrastructure/prisma/prisma-organization.repository.js';
import {OrganizationController} from './presentation/http/organization.controller.js';
import {BranchesController} from './presentation/http/branches.controller.js';
import {DevicesController} from './presentation/http/devices.controller.js';

@Module({
 imports:[PrismaModule,AuthModule],
 controllers:[OrganizationController,BranchesController,DevicesController],
 providers:[OrganizationService,{provide:OrganizationRepositoryPort,useClass:PrismaOrganizationRepository}],
 exports:[OrganizationService,OrganizationRepositoryPort]
})
export class OrganizationModule{}
