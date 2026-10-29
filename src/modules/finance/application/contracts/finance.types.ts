export interface FinanceAccountQueryDto{sucursalId:string;page:number;limit:number}
export interface FinanceOperationIntentDto{
 sucursalId:string;accion:'FIN_ACCOUNT_CREATE'|'FIN_EXPENSE_CREATE'|'FIN_EXTERNAL_POST'|'FIN_ROUTING_UPSERT'
}
export interface FinanceAccountCreateDto{
 operationId:string;sucursalId:string;nombre:string;tipo:'BANCO'|'TARJETA_EMPRESA'|'EFECTIVO_EXTERNO'
}
export interface FinanceMovementQueryDto{page:number;limit:number}
export interface FinanceExpenseQueryDto extends FinanceAccountQueryDto{}
export interface FinanceExpenseCreateDto{
 operationId:string;sucursalId:string;origen:'CAJA'|'CUENTA_FINANCIERA';
 monto:string;descripcion:string;categoria?:string;proveedorId?:string;
 turnoId?:string;cuentaFinancieraId?:string;documentoReferencia?:string
}
export interface FinanceExternalPendingQueryDto extends FinanceAccountQueryDto{
 sourceType:'PAGO'|'REEMBOLSO_PAGO'|'PAGO_PROVEEDOR'
}
export interface FinanceExternalPostDto{
 operationId:string;sucursalId:string;sourceType:'PAGO'|'REEMBOLSO_PAGO'|'PAGO_PROVEEDOR';
 sourceId:string;cuentaFinancieraId:string
}
export interface FinanceRouteUpsertDto{
 operationId:string;sucursalId:string;metodo:'TARJETA'|'TRANSFERENCIA'|'OTRO';
 cuentaFinancieraId:string;activa?:boolean
}
