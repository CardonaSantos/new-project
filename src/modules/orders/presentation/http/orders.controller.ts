import {Body,Controller,Delete,Get,Param,Patch,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {OrderService} from '../../application/order.service.js';
import {KitchenService} from '../../application/kitchen.service.js';
import {TableService} from '../../application/table.service.js';
import {AddItemsDto,BranchQueryDto,CreateOrderDto,EditLineDto,EditOrderDto,
 OrderListDto,ReasonDto,RouteDto,RouteUpdateDto,RoomDto,RoomUpdateDto,TableUpdateDto,KitchenChangesDto,
 CancelOrderDto,SendDto,StartLineDto,StationDto,
 StationUpdateDto,TableDto,TicketListDto} from './dto/orders.dto.js';

@Controller('orders')
export class OrdersController{
 constructor(private readonly orders:OrderService){}
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
  @Body() d:CancelOrderDto){return this.orders.cancel(u,id,d);}
 @Post(':id/close') close(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.orders.close(u,id);}
}
@Controller('tables')
export class TablesController{
 constructor(private readonly tables:TableService){}
 @Get('rooms') rooms(@CurrentUser() u:Principal,@Query() q:BranchQueryDto){return this.tables.rooms(u,q.sucursalId);}
 @Post('rooms') createRoom(@CurrentUser() u:Principal,@Body() d:RoomDto){return this.tables.createRoom(u,d);}
 @Patch('rooms/:id') updateRoom(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:RoomUpdateDto){
  return this.tables.updateRoom(u,id,d);}
 @Get() list(@CurrentUser() u:Principal,@Query() q:BranchQueryDto){return this.tables.list(u,q.sucursalId);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:TableDto){return this.tables.createTable(u,d);}
 @Patch(':id') update(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:TableUpdateDto){
  return this.tables.updateTable(u,id,d);}
 @Post('occupancies/:id/close') close(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.tables.close(u,id);
 }
}
@Controller('kitchen')
export class KitchenController{
 constructor(private readonly kitchen:KitchenService){}
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
 @Patch('routes/:id') editRoute(@CurrentUser() u:Principal,@Param('id') id:string,
  @Body() d:RouteUpdateDto){return this.kitchen.editRoute(u,id,d);}
 @Delete('routes/:id') removeRoute(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.kitchen.removeRoute(u,id);}
 @Get('changes') changes(@CurrentUser() u:Principal,@Query() q:KitchenChangesDto){
  return this.kitchen.changes(u,q);}
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
