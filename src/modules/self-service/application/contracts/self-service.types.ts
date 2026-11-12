/** Contracts for the customer-facing self-service (QR / tablet) ordering flow.
 * The customer never holds a staff Principal; every request after /access carries
 * an opaque session token that resolves to a SelfServiceSession via the guard. */

export interface SelfServiceSession{
 sesionId:string;
 sucursalId:string;
 mesaId:string;
 ordenId:string|null;
}

export interface TableQrIssued{
 id:string;
 mesaId:string;
 /** Plain-text secret, returned ONLY at issuance time. Only its hash is persisted. */
 token:string;
 url:string;
 expiraEn:string|null;
}

export interface TableQrSummary{
 id:string;
 mesaId:string;
 activo:boolean;
 expiraEn:string|null;
 creadoEn:string;
}

export interface SelfServiceAccess{
 sessionToken:string;
 sesionId:string;
 expiraEn:string;
 sucursal:{id:string;nombre:string;moneda:string};
 mesa:{id:string;numero:string;sala:string};
}

export interface SelfServiceItemInput{
 varianteId:string;
 cantidad:string;
 modificadores?:Array<{modificadorId:string}>;
 notasCocina?:string;
}
