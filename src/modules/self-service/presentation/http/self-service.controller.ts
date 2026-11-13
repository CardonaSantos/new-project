import {Body,Controller,Get,Param,Patch,Post,UseGuards} from '@nestjs/common';
import {Public,CurrentUser} from '../../../auth/presentation/http/decorators/auth.decorators.js';
import type {Principal} from '../../../auth/application/auth.service.js';
import {SelfServiceService} from '../../application/self-service.service.js';
import {SelfServiceSessionGuard} from './guards/self-service-session.guard.js';
import {CurrentSelfServiceSession} from './decorators/self-service.decorators.js';
import type {SelfServiceSession} from '../../application/contracts/self-service.types.js';
import {IssueTableQrDto,SelfServiceAccessDto,SelfServiceAddItemsDto,
 SelfServiceUpdateLineDto} from './dto/self-service.dto.js';

/** Customer-facing: no staff login. /access is public; everything else is
 * gated by SelfServiceSessionGuard, a session minted by /access — not the
 * staff JWT guard (which stays active on every other controller in the app). */
@Controller('self-service')
export class SelfServiceController{
 constructor(private readonly service:SelfServiceService){}

 @Public()
 @Post('access')
 access(@Body() d:SelfServiceAccessDto){return this.service.access(d.token);}

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Get('menu')
 menu(@CurrentSelfServiceSession() s:SelfServiceSession){return this.service.menu(s);}

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Get('order')
 cart(@CurrentSelfServiceSession() s:SelfServiceSession){return this.service.cart(s);}

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Post('order/items')
 addItems(@CurrentSelfServiceSession() s:SelfServiceSession,@Body() d:SelfServiceAddItemsDto){
  return this.service.addItems(s,d.lineas);
 }

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Patch('order/items/:lineaId')
 updateLineQuantity(@CurrentSelfServiceSession() s:SelfServiceSession,
  @Param('lineaId') lineaId:string,@Body() d:SelfServiceUpdateLineDto){
  return this.service.updateLineQuantity(s,lineaId,d.cantidad);
 }

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Post('order/items/:lineaId/remove')
 removeLine(@CurrentSelfServiceSession() s:SelfServiceSession,@Param('lineaId') lineaId:string){
  return this.service.removeLine(s,lineaId);
 }

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Post('order/send')
 send(@CurrentSelfServiceSession() s:SelfServiceSession){return this.service.send(s);}

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Post('call-waiter')
 callWaiter(@CurrentSelfServiceSession() s:SelfServiceSession){return this.service.callWaiter(s);}

 @Public()
 @UseGuards(SelfServiceSessionGuard)
 @Post('session/close')
 close(@CurrentSelfServiceSession() s:SelfServiceSession){return this.service.closeSession(s);}
}

/** Staff-facing: provisioning the QR codes that feed the controller above.
 * Stays under the normal staff AuthenticationGuard (no @Public here). */
@Controller('self-service/tables')
export class SelfServiceTablesController{
 constructor(private readonly service:SelfServiceService){}

 @Post(':mesaId/qr')
 issue(@CurrentUser() u:Principal,@Param('mesaId') mesaId:string,@Body() d:IssueTableQrDto){
  return this.service.issueTableQr(u,mesaId,d.expiraEn);
 }
 @Get(':mesaId/qr')
 list(@CurrentUser() u:Principal,@Param('mesaId') mesaId:string){
  return this.service.listTableQr(u,mesaId);
 }
 @Post('qr/:id/revoke')
 revoke(@CurrentUser() u:Principal,@Param('id') id:string){
  return this.service.revokeTableQr(u,id);
 }
}
