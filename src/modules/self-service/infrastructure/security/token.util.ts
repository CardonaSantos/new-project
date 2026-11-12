import {createHash,randomBytes} from 'node:crypto';

/** Opaque bearer secret for QR tokens and self-service sessions. Only its digest
 * is ever persisted; the plain value is handed to the client once, at issuance. */
export function randomToken():string{
 return randomBytes(32).toString('base64url');
}
export function digest(value:string):string{
 return createHash('sha256').update(value).digest('hex');
}
