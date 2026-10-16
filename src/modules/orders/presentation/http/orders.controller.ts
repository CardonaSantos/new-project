import {Body,Controller,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {OrderStore} from '../infrastructure/prisma/order.store.js';
import {KitchenStore} from '../infrastructure/prisma/kitchen.store.js';
import {TableStore} from '../infrastructure/prisma/table.store.js';
import {AddItemsDto,BranchQueryDto,CreateOrderDto,EditLineDto,EditOrderDto,
 OrderListDto,ReasonDto,RouteDto,RoomDto,SendDto,StartLineDto,StationDto,
 StationUpdateDto,TableDto,TicketListDto} from './dto/orders.dto.js';

@Controller('orders')
export class OrdersController{
 constructor(private readonly orders:OrderStore){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:OrderListDto){return this.orders.list(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:CreateOrderDto){return this.orders.create(u,d);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.orders.detail(u,id);}
 @Patch(':id') edit(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:EditOrderDto){return this.orders.edit(u,id,d);}
 @Post(':id/lines') add(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:AddItemsDto){return this.orders.add(u,id,d);}
 @Patch(':id/lines/:lineId') editLine(@CurrentUser() u:Principal,@Param('id') id:string,
  @Param('lineId') lineId:string,@Body() d:EditLineDto){return this.orders.editLine(u,id,lineId,d);}
 @Post(':id/lines/:lineId/cancel') cancelLine(@CurrentUser() u:Principal,
  @Param('id') id:string,@Param('lineId') lineId:string,@Body() d:ReasonDto){
  return this.orders.cancelLine(u,id,lineId,d);
 }
 @Post(':id/send') send(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:SendDto){return this.orders.send(u,id,d);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:ReasonDto){return this.orders.cancel(u,id,d);}
}
@Controller('tables')
export class TablesController{
 constructor(private readonly tables:TableStore){}
 @Get('rooms') rooms(@CurrentUser() u:Principal,@Query() q:BranchQueryDto){return this.tables.rooms(u,q.sucursalId);}
 @Post('rooms') createRoom(@CurrentUser() u:Principal,@Body() d:RoomDto){return this.tables.createRoom(u,d);}
 @Get() list(@CurrentUser() u:Principal,@Query() q:BranchQueryDto){return this.tables.list(u,q.sucursalId);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:TableDto){return this.tables.createTable(u,d);}
 @Post('occupancies/:id/close') close(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.tables.close(u,id);
 }
}
@Controller('kitchen')
export class KitchenController{
 constructor(private readonly kitchen:KitchenStore){}
 @Get('stations') stations(@CurrentUser() u:Principal,@Query() q:BranchQueryDto){
  return this.kitchen.stations(u,q.sucursalId);}
 @Post('stations') station(@CurrentUser() u:Principal,@Body() d:StationDto){
  return this.kitchen.createStation(u,d);}
 @Patch('stations/:id') stationUpdate(@CurrentUser() u:Principal,
  @Param('id') id:string,@Body() d:StationUpdateDto){return this.kitchen.updateStation(u,id,d);}
 @Get('routes') routes(@CurrentUser() u:Principal,@Query() q:BranchQueryDto){
  return this.kitchen.routes(u,q.sucursalId);}
 @Post('routes') route(@CurrentUser() u:Principal,@Body() d:RouteDto){
  return this.kitchen.route(u,d);}
 @Get('tickets') tickets(@CurrentUser() u:Principal,@Query() q:TicketListDto){
  return this.kitchen.list(u,q);}
 @Get('tickets/:id') ticket(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.kitchen.detail(u,id);}
 @Post('tickets/:id/start') start(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.kitchen.start(u,id);}
 @Post('tickets/:id/ready') ready(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.kitchen.ready(u,id);}
 @Post('lines/:id/start') startLine(@CurrentUser() u:Principal,
  @Param('id') id:string,@Body() d:StartLineDto){return this.kitchen.startLine(u,id,d);}
 @Post('lines/:id/ready') readyLine(@CurrentUser() u:Principal,
  @Param('id') id:string){return this.kitchen.readyLine(u,id);}
 @Post('lines/:id/deliver') deliver(@CurrentUser() u:Principal,
  @Param('id') id:string){return this.kitchen.deliver(u,id);}
}
