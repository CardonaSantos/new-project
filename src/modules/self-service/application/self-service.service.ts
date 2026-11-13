import {Injectable} from '@nestjs/common';
import type {Principal} from '../../auth/application/auth.service.js';
import {SelfServicePort} from './ports/self-service.repository.js';
import type {SelfServiceItemInput,SelfServiceSession} from './contracts/self-service.types.js';

@Injectable()
export class SelfServiceService{
 constructor(private readonly port:SelfServicePort){}
 issueTableQr(u:Principal,mesaId:string,expiraEn?:string|null){return this.port.issueTableQr(u,mesaId,expiraEn);}
 listTableQr(u:Principal,mesaId:string){return this.port.listTableQr(u,mesaId);}
 revokeTableQr(u:Principal,id:string){return this.port.revokeTableQr(u,id);}
 access(token:string){return this.port.access(token);}
 menu(s:SelfServiceSession){return this.port.menu(s);}
 cart(s:SelfServiceSession){return this.port.cart(s);}
 addItems(s:SelfServiceSession,items:SelfServiceItemInput[]){return this.port.addItems(s,items);}
 updateLineQuantity(s:SelfServiceSession,lineaId:string,cantidad:string){
  return this.port.updateLineQuantity(s,lineaId,cantidad);
 }
 removeLine(s:SelfServiceSession,lineaId:string){return this.port.removeLine(s,lineaId);}
 send(s:SelfServiceSession){return this.port.send(s);}
 callWaiter(s:SelfServiceSession){return this.port.callWaiter(s);}
 closeSession(s:SelfServiceSession){return this.port.closeSession(s);}
}
