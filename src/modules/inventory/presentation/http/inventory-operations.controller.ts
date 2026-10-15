import {Body,Controller,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {InventoryOperationsStore} from '../../infrastructure/prisma/inventory-operations.store.js';
import {ManualPostingDto,LotCreateDto,LotStatusDto,StockBranchDto,CountCreateDto,TransferCreateDto,OperationKeyDto} from './dto/inventory-operations.dto.js';
@Controller('inventory/stock')
export class InventoryStockController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Get() stock(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.stock(u,q);}
 @Get('summary') summary(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.summary(u,q);}
}
@Controller('inventory/lots')
export class InventoryLotsController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.lots(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() dto:LotCreateDto){return this.store.createLot(u,dto);}
 @Patch(':id/block') block(@CurrentUser() u:Principal,@Param('id') id:string,@Body() dto:LotStatusDto){
  return this.store.blockLot(u,id,dto);
 }
}
@Controller('inventory/movements')
export class InventoryMovementsController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.movements(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.store.movement(u,id);}
}
@Controller('inventory/operations')
export class InventoryManualController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Post('opening') opening(@CurrentUser() u:Principal,@Body() dto:ManualPostingDto){return this.store.manual(u,'OPENING',dto);}
 @Post('inbound') inbound(@CurrentUser() u:Principal,@Body() dto:ManualPostingDto){return this.store.manual(u,'INBOUND',dto);}
 @Post('outbound') outbound(@CurrentUser() u:Principal,@Body() dto:ManualPostingDto){return this.store.manual(u,'OUTBOUND',dto);}
 @Post('waste') waste(@CurrentUser() u:Principal,@Body() dto:ManualPostingDto){return this.store.manual(u,'WASTE',dto);}
}
@Controller('inventory/counts')
export class InventoryCountsController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Post() create(@CurrentUser() u:Principal,@Body() dto:CountCreateDto){return this.store.createCount(u,dto);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.store.count(u,id);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string){return this.store.confirmCount(u,id);}
}
@Controller('inventory/transfers')
export class InventoryTransfersController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Post() create(@CurrentUser() u:Principal,@Body() dto:TransferCreateDto){return this.store.createTransfer(u,dto);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.store.transfer(u,id);}
 @Post(':id/dispatch') dispatch(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.store.dispatch(u,id);
 }
 @Post(':id/receive') receive(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.store.receive(u,id);
 }
}
@Controller('inventory/reports')
export class InventoryOperationalReportsController{
 constructor(private readonly store:InventoryOperationsStore){}
 @Get('valuation') valuation(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.valuation(u,q);}
 @Get('expiry') expiry(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.expiry(u,q);}
 @Get('reconciliation') reconciliation(@CurrentUser() u:Principal,@Query() q:StockBranchDto){return this.store.reconciliation(u,q);}
}
