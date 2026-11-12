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

/** Public, customer-safe projection of a branch's published menu — reshaped in
 * SelfServiceStore.menu() from CatalogService.branchMenu's staff/POS-oriented
 * raw output, which must never reach an unauthenticated client as-is. */
export interface SelfServiceMenuModifierOption{id:string;nombre:string;recargo:string}
export interface SelfServiceMenuModifierGroup{
 grupoId:string;grupo:string;orden:number;minimo:number;maximo:number;
 opciones:SelfServiceMenuModifierOption[];
}
export interface SelfServiceMenuItem{
 id:string;varianteId:string;nombre:string;descripcion:string|null;
 precio:string;moneda:string;imagenUrl:string|null;
 gruposModificadores:SelfServiceMenuModifierGroup[];
}
export interface SelfServiceMenuSection{id:string;nombre:string;orden:number;items:SelfServiceMenuItem[]}
export interface SelfServiceMenuCard{id:string;nombre:string;descripcion:string|null;secciones:SelfServiceMenuSection[]}
export interface SelfServiceMenuResponse{sucursalId:string;menus:SelfServiceMenuCard[]}

/** Public, customer-safe projection of an Orden — reshaped in
 * SelfServiceStore.cart() from OrderService.detail()'s raw Prisma row (same one
 * POS uses internally), which carries internal references (usuarioId, cliente
 * PII, recipe composition snapshots, kitchen ticket state, claveOperacion) that
 * must never reach an unauthenticated client. */
export interface SelfServiceOrderLineModifier{nombre:string;cantidad:number;recargoUnitario:string}
export interface SelfServiceOrderLine{
 id:string;nombre:string;cantidad:string;precioUnitario:string;descuento:string;
 subtotal:string;notasCocina:string|null;modificadores:SelfServiceOrderLineModifier[];
}
export interface SelfServiceOrderSummary{
 id:string;numero:string;estado:'ABIERTA'|'CERRADA'|'CANCELADA';
 subtotal:string;descuentoTotal:string;total:string;
 lineas:SelfServiceOrderLine[];
}
export interface SelfServiceCart{ordenId:string|null;orden:SelfServiceOrderSummary|null}
