import {Body,Controller,Get,Param,Patch,Post,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {InventoryService} from '../../application/inventory.service.js';
import {WarehouseDto,WarehouseListDto,WarehouseOptionsDto,LocationDto,LocationListDto,
 LocationOptionsDto,LocationUpdateDto,RenameDto,StatusDto} from './dto/inventory.dto.js';
@Controller('inventory/warehouses')
export class InventoryWarehousesController{
 constructor(private readonly service:InventoryService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:WarehouseOptionsDto){return this.service.warehouseOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:WarehouseListDto){return this.service.warehouses(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() dto:WarehouseDto){return this.service.createWarehouse(a,dto);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string){return this.service.warehouse(a,id);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:RenameDto){
  return this.service.updateWarehouse(a,id,dto);
 }
 @Patch(':id/status') status(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:StatusDto){
  return this.service.warehouseStatus(a,id,dto.activo,dto.motivo);
 }
}
@Controller('inventory/locations')
export class InventoryLocationsController{
 constructor(private readonly service:InventoryService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:LocationOptionsDto){return this.service.locationOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:LocationListDto){return this.service.locations(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() dto:LocationDto){return this.service.createLocation(a,dto);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string){return this.service.location(a,id);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:LocationUpdateDto){
  return this.service.updateLocation(a,id,dto);
 }
 @Patch(':id/status') status(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:StatusDto){
  return this.service.locationStatus(a,id,dto.activo,dto.motivo);
 }
}
