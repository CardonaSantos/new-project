
import {Body,Controller,Get,Param,Patch,Post,Put,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {PurchaseMastersStore} from '../../infrastructure/prisma/purchase-masters.store.js';
import {PurchaseOrdersStore} from '../../infrastructure/prisma/purchase-orders.store.js';
import {PurchaseReceiptsStore} from '../../infrastructure/prisma/purchase-receipts.store.js';
import {PurchaseInvoicesStore} from '../../infrastructure/prisma/purchase-invoices.store.js';
import {PurchasePaymentsStore} from '../../infrastructure/prisma/purchase-payments.store.js';
import {PurchaseReturnsStore} from '../../infrastructure/prisma/purchase-returns.store.js';
import {Paging,SupplierDto,SupplierPatchDto,StatusDto,PresentationDto,PurchaseOrderDto,
 ReceiptDto,InvoiceDto,SupplierPaymentDto,ApplyDto,ReturnDto,CreditDto,CreditApplyDto,
 RefundSupplierDto,KeyDto,ReasonKeyDto} from './dto/purchases.dto.js';
@Controller('purchases/suppliers')
export class SuppliersController{
 constructor(private readonly s:PurchaseMastersStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.suppliers(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string,@Query() q:Paging){
  return this.s.supplier(u,id,q.sucursalId);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:SupplierDto){return this.s.createSupplier(u,d);}
 @Patch(':id') update(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:SupplierPatchDto){
  return this.s.updateSupplier(u,id,d);}
 @Patch(':id/status') status(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:StatusDto){
  return this.s.status(u,id,d);}
}
@Controller('purchases/presentations')
export class PresentationsController{
 constructor(private readonly s:PurchaseMastersStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.presentations(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:PresentationDto){return this.s.createPresentation(u,d);}
 @Patch(':id/status') status(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:StatusDto){
  return this.s.presentationStatus(u,id,d);}
}
@Controller('purchases/orders')
export class PurchaseOrdersController{
 constructor(private readonly s:PurchaseOrdersStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.list(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.detail(u,id);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:PurchaseOrderDto){return this.s.create(u,d);}
 @Put(':id') edit(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:PurchaseOrderDto){
  return this.s.edit(u,id,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirm(u,id,d);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReasonKeyDto){
  return this.s.cancel(u,id,d);}
 @Post(':id/close') close(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReasonKeyDto){
  return this.s.close(u,id,d);}
}
@Controller('purchases/receipts')
export class PurchaseReceiptsController{
 constructor(private readonly s:PurchaseReceiptsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.list(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.detail(u,id);}
 @Get(':id/movements') movements(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.s.movements(u,id);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:ReceiptDto){return this.s.create(u,d);}
 @Put(':id') edit(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReceiptDto){
  return this.s.edit(u,id,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirm(u,id,d);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.cancel(u,id,d);}
}
@Controller('purchases/invoices')
export class PurchaseInvoicesController{
 constructor(private readonly s:PurchaseInvoicesStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.list(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.detail(u,id);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:InvoiceDto){return this.s.create(u,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirm(u,id,d);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReasonKeyDto){
  return this.s.cancel(u,id,d);}
}
@Controller('purchases/payments')
export class PurchasePaymentsController{
 constructor(private readonly s:PurchasePaymentsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.list(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.detail(u,id);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:SupplierPaymentDto){return this.s.create(u,d);}
 @Post(':id/apply') apply(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ApplyDto){
  return this.s.apply(u,id,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirm(u,id,d);}
 @Post(':id/reject') reject(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReasonKeyDto){
  return this.s.reject(u,id,d);}
}
@Controller('purchases/returns')
export class PurchaseReturnsController{
 constructor(private readonly s:PurchaseReturnsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.returns(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.returnDetail(u,id);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:ReturnDto){return this.s.createReturn(u,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirmReturn(u,id,d);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.cancelReturn(u,id,d);}
}
@Controller('purchases/credits')
export class PurchaseCreditsController{
 constructor(private readonly s:PurchaseReturnsStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:Paging){return this.s.credits(u,q);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.s.creditDetail(u,id);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:CreditDto){return this.s.createCredit(u,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirmCredit(u,id,d);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.cancelCredit(u,id,d);}
 @Post(':id/apply') apply(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:CreditApplyDto){
  return this.s.applyCredit(u,id,d);}
}
@Controller('purchases/refunds')
export class PurchaseSupplierRefundsController{
 constructor(private readonly s:PurchaseReturnsStore){}
 @Post() create(@CurrentUser() u:Principal,@Body() d:RefundSupplierDto){return this.s.createSupplierRefund(u,d);}
 @Post(':id/confirm') confirm(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:KeyDto){
  return this.s.confirmSupplierRefund(u,id,d);}
 @Post(':id/reject') reject(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:ReasonKeyDto){
  return this.s.rejectSupplierRefund(u,id,d);}
}
