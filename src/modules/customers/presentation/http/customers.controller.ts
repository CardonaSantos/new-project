import {Body,Controller,Get,Header,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../auth/application/auth.service.js';
import {CustomersService} from '../application/customers.service.js';
import {CustomerBranchQueryDto,CustomerListDto,CustomerMutationDto,CreateCustomerDto,
 UpdateCustomerDto,DeactivateCustomerDto,CreateAddressDto,UpdateAddressDto} from './dto/customers.dto.js';

@Controller('customers')
@Header('Cache-Control','no-store')
export class CustomersController {
 constructor(private readonly customers:CustomersService){}
 @Get()
 list(@CurrentUser() actor:Principal,@Query() q:CustomerListDto){return this.customers.list(actor,q);}
 @Post()
 create(@CurrentUser() actor:Principal,@Body() d:CreateCustomerDto){return this.customers.create(actor,d);}
 @Get(':id')
 detail(@CurrentUser() actor:Principal,@Param('id') id:string,@Query() q:CustomerBranchQueryDto){
  return this.customers.detail(actor,id,q.sucursalId);
 }
 @Patch(':id')
 update(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() d:UpdateCustomerDto){
  return this.customers.update(actor,id,d);
 }
 @Post(':id/deactivate')
 deactivate(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() d:DeactivateCustomerDto){
  return this.customers.deactivate(actor,id,d);
 }
 @Get(':id/addresses')
 addresses(@CurrentUser() actor:Principal,@Param('id') id:string,@Query() q:CustomerBranchQueryDto){
  return this.customers.addresses(actor,id,q.sucursalId);
 }
 @Post(':id/addresses')
 addAddress(@CurrentUser() actor:Principal,@Param('id') id:string,@Body() d:CreateAddressDto){
  return this.customers.addAddress(actor,id,d);
 }
 @Patch(':id/addresses/:addressId')
 updateAddress(@CurrentUser() actor:Principal,@Param('id') id:string,
  @Param('addressId') aid:string,@Body() d:UpdateAddressDto){
  return this.customers.updateAddress(actor,id,aid,d);
 }
 @Post(':id/addresses/:addressId/primary')
 primary(@CurrentUser() actor:Principal,@Param('id') id:string,
  @Param('addressId') aid:string,@Body() d:CustomerMutationDto){
  return this.customers.setPrimary(actor,id,aid,d);
 }
 @Post(':id/addresses/:addressId/deactivate')
 deactivateAddress(@CurrentUser() actor:Principal,@Param('id') id:string,
  @Param('addressId') aid:string,@Body() d:CustomerMutationDto){
  return this.customers.deactivateAddress(actor,id,aid,d);
 }
}
