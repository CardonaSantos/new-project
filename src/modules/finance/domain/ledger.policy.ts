export type FinancialSource='PAGO'|'REEMBOLSO_PAGO'|'PAGO_PROVEEDOR'|'LIQUIDACION_CANAL';
export function customerCreditAllowed(source:FinancialSource,accountType:string){
 return !['PAGO','LIQUIDACION_CANAL'].includes(source)||accountType!=='TARJETA_EMPRESA';
}
