import {Body,Controller,Get,Param,Post,Query} from '@nestjs/common';
import {CurrentUser} from '../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../auth/application/auth.service.js';
import {OrdersService} from '../application/orders.service.js';
import {OrderCreateDto,AddLinesDto,OrderPageDto,KitchenPageDto,StationDto,RouteDto,TableOpenDto} from './dto/order.dto.js';
@Controller('orders')
export class OrdersController{
 constructor(private readonly service:OrdersService){}
 @Get() list(@CurrentUser() u:Principal,@Query() q:OrderPageDto){return this.service.list(u,q);}
 @Post() create(@CurrentUser() u:Principal,@Body() d:OrderCreateDto){return this.service.create(u,d);}
 @Get(':id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.detail(u,id);}
 @Post(':id/lines') add(@CurrentUser() u:Principal,@Param('id') id:string,@Body() d:AddLinesDto){return this.service.add(u,id,d);}
 @Post(':id/dispatch') dispatch(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.dispatch(u,id);}
 @Post(':id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.cancel(u,id);}
}
@Controller('kitchen')
export class KitchenController{
 constructor(private readonly service:OrdersService){}
 @Get('commands') list(@CurrentUser() u:Principal,@Query() q:KitchenPageDto){return this.service.kitchen(u,q);}
 @Get('commands/:id') detail(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.kitchenDetail(u,id);}
 @Post('commands/:id/start') start(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.kitchenStart(u,id);}
 @Post('commands/:id/ready') ready(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.kitchenReady(u,id);}
 @Post('commands/:id/cancel') cancel(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.kitchenCancel(u,id);}
 @Get('stations') stations(@CurrentUser() u:Principal,@Query('sucursalId') b:string){return this.service.stations(u,b);}
 @Post('stations') stationCreate(@CurrentUser() u:Principal,@Body() d:StationDto){return this.service.stationCreate(u,d);}
 @Post('routes') routeCreate(@CurrentUser() u:Principal,@Body() d:RouteDto){return this.service.routeCreate(u,d);}
}
@Controller('tables')
export class TablesController{
 constructor(private readonly service:OrdersService){}
 @Get() tables(@CurrentUser() u:Principal,@Query('sucursalId') b:string){return this.service.tables(u,b);}
 @Post('occupancies') open(@CurrentUser() u:Principal,@Body() d:TableOpenDto){return this.service.tableOpen(u,d);}
 @Post('occupancies/:id/close') close(@CurrentUser() u:Principal,@Param('id') id:string){return this.service.tableClose(u,id);}
}
