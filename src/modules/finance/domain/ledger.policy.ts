export type FinancialSource='PAGO'|'REEMBOLSO_PAGO'|'PAGO_PROVEEDOR';
export function customerCreditAllowed(source:FinancialSource,accountType:string){
 return source!=='PAGO'||accountType!=='TARJETA_EMPRESA';
}
