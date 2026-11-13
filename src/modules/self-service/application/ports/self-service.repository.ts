import type {Principal} from '../../../auth/application/auth.service.js';
import type {SelfServiceAccess,SelfServiceCart,SelfServiceItemInput,SelfServiceMenuResponse,
 SelfServiceSession,TableQrIssued,TableQrSummary} from '../contracts/self-service.types.js';

export abstract class SelfServicePort{
 // Staff-facing: provisioning the QR a table will display/print.
 abstract issueTableQr(u:Principal,mesaId:string,expiraEn?:string|null):Promise<TableQrIssued>;
 abstract listTableQr(u:Principal,mesaId:string):Promise<TableQrSummary[]>;
 abstract revokeTableQr(u:Principal,id:string):Promise<void>;
 // Customer-facing.
 abstract access(token:string):Promise<SelfServiceAccess>;
 abstract menu(s:SelfServiceSession):Promise<SelfServiceMenuResponse>;
 abstract cart(s:SelfServiceSession):Promise<SelfServiceCart>;
 abstract addItems(s:SelfServiceSession,items:SelfServiceItemInput[]):Promise<SelfServiceCart>;
 abstract updateLineQuantity(s:SelfServiceSession,lineaId:string,cantidad:string):Promise<SelfServiceCart>;
 abstract removeLine(s:SelfServiceSession,lineaId:string):Promise<SelfServiceCart>;
 abstract send(s:SelfServiceSession):Promise<SelfServiceCart>;
 /** Fire-and-forget nudge to staff (RealtimePort "TABLE_HELP_REQUESTED") — not an order
  * action, so it never touches the Orden/cart state and can't fail the customer's flow. */
 abstract callWaiter(s:SelfServiceSession):Promise<void>;
 abstract closeSession(s:SelfServiceSession):Promise<void>;
 // Guard support.
 abstract resolveSession(hashSesion:string):Promise<SelfServiceSession|null>;
}
