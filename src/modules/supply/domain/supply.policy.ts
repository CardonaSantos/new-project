/** Visible status derives from physical delivery, not UI drafts. */
export function supplyVisibleStatus(estado:string,delivered:boolean,transit:boolean){
 return estado==='ATENDIDA'?'ATENDIDA':estado==='CANCELADA'?'CANCELADA':
  delivered?'PARCIAL':transit?'EN_PROCESO':'SOLICITADA';
}
