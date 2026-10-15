import {Controller,Get,Query} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {CurrentUser} from '../../auth/presentation/http/decorators/auth.decorators.js';
import {CatalogService} from '../application/catalog.service.js';
import {BranchQueryDto} from './dto/catalog.dto.js';
@Controller('catalog/reports')
export class CatalogReportsController{
 constructor(private readonly service:CatalogService){}
 @Get('summary') summary(@CurrentUser() a:Principal,@Query() q:BranchQueryDto){
  return this.service.summary(a,q.sucursalId);
 }
 @Get('price-coverage') coverage(@CurrentUser() a:Principal,@Query() q:import('./dto/catalog.dto.js').PriceQueryDto){
  return this.service.coverage(a,q.sucursalId,q.fecha);
 }
}
