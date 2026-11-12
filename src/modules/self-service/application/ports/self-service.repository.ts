import type {Principal} from '../../../auth/application/auth.service.js';
import type {SelfServiceAccess,SelfServiceItemInput,SelfServiceMenuResponse,SelfServiceSession,
 TableQrIssued,TableQrSummary} from '../contracts/self-service.types.js';

export abstract class SelfServicePort{
 // Staff-facing: provisioning the QR a table will display/print.
 abstract issueTableQr(u:Principal,mesaId:string,expiraEn?:string|null):Promise<TableQrIssued>;
 abstract listTableQr(u:Principal,mesaId:string):Promise<TableQrSummary[]>;
 abstract revokeTableQr(u:Principal,id:string):Promise<void>;
 // Customer-facing.
 abstract access(token:string):Promise<SelfServiceAccess>;
 abstract menu(s:SelfServiceSession):Promise<SelfServiceMenuResponse>;
 abstract cart(s:SelfServiceSession):Promise<unknown>;
 abstract addItems(s:SelfServiceSession,items:SelfServiceItemInput[]):Promise<{session:SelfServiceSession;orden:unknown}>;
 abstract send(s:SelfServiceSession):Promise<unknown>;
 abstract closeSession(s:SelfServiceSession):Promise<void>;
 // Guard support.
 abstract resolveSession(hashSesion:string):Promise<SelfServiceSession|null>;
}
