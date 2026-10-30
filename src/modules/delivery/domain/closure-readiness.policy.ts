export type ClosureBlocker='ORDER_NOT_OPEN'|'DELIVERY_NOT_COMPLETED'|'NO_ORDER_LINES'|'LINES_NOT_SENT'|'KITCHEN_PENDING'|'NO_ACCOUNTS'|'ACCOUNTS_UNPAID';
type Amount={gt(other:unknown):boolean;eq(other:unknown):boolean};
export type DeliveryClosureInput={
 orderStatus:string;deliveryStatus:string;
 lines:ReadonlyArray<{cantidad:Amount;cantidadEnviada:unknown}>;
 accounts:ReadonlyArray<{total:Amount;pagado:unknown}>;pendingKitchen:number;
};
export function closureReadiness(d:DeliveryClosureInput){
 const alreadyClosed=d.orderStatus==='CERRADA';
 const blockers:ClosureBlocker[]=[];
 if(d.orderStatus!=='ABIERTA'&&!alreadyClosed)blockers.push('ORDER_NOT_OPEN');
 if(d.deliveryStatus!=='ENTREGADA')blockers.push('DELIVERY_NOT_COMPLETED');
 if(!d.lines.length)blockers.push('NO_ORDER_LINES');
 else if(d.lines.some(l=>l.cantidad.gt(l.cantidadEnviada)))blockers.push('LINES_NOT_SENT');
 if(d.pendingKitchen>0)blockers.push('KITCHEN_PENDING');
 if(!d.accounts.length)blockers.push('NO_ACCOUNTS');
 else if(d.accounts.some(a=>!a.total.eq(a.pagado)))blockers.push('ACCOUNTS_UNPAID');
 return {alreadyClosed,canFinalize:!alreadyClosed&&d.orderStatus==='ABIERTA'&&blockers.length===0,
  blockers:alreadyClosed?[]:blockers};
}
