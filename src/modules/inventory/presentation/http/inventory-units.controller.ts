import {Body,Controller,Get,Param,Patch,Post,Query} from '@nestjs/common';
import type {Principal} from '../../../auth/application/auth.service.js';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import {InventoryService} from '../../application/inventory.service.js';
import {ConversionDto,ConversionListDto,ConversionPreviewDto,PageDto,RenameDto,UnitDto,UnitOptionsDto} from './dto/inventory.dto.js';

@Controller('inventory/units')
export class InventoryUnitsController{
 constructor(private readonly service:InventoryService){}
 @Get('options') options(@CurrentUser() a:Principal,@Query() q:UnitOptionsDto){return this.service.unitOptions(a,q);}
 @Get() list(@CurrentUser() a:Principal,@Query() q:PageDto){return this.service.units(a,q);}
 @Get(':id') detail(@CurrentUser() a:Principal,@Param('id') id:string){return this.service.unit(a,id);}
 @Post() create(@CurrentUser() a:Principal,@Body() dto:UnitDto){return this.service.createUnit(a,dto);}
 @Patch(':id') update(@CurrentUser() a:Principal,@Param('id') id:string,@Body() dto:RenameDto){
  return this.service.updateUnit(a,id,dto.nombre);
 }
}
@Controller('inventory/conversions')
export class InventoryConversionsController{
 constructor(private readonly service:InventoryService){}
 @Get() list(@CurrentUser() a:Principal,@Query() q:ConversionListDto){return this.service.conversions(a,q);}
 @Post() create(@CurrentUser() a:Principal,@Body() dto:ConversionDto){return this.service.createConversion(a,dto);}
 @Post('preview') preview(@CurrentUser() a:Principal,@Body() dto:ConversionPreviewDto){
  return this.service.convert(a,dto.unidadOrigenId,dto.unidadDestinoId,dto.cantidad);
 }
}
