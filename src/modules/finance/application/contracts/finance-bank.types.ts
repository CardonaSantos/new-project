export interface BankLineInput{claveExterna:string;fecha:string;monto:string;referencia?:string;descripcion?:string}
export interface BankImportInput{operationId:string;sucursalId:string;cuentaFinancieraId:string;lineas:BankLineInput[]}
export interface BankMatchInput{operationId:string;sucursalId:string;lineaId:string;movimientoId:string}
export interface BankUnmatchInput{operationId:string;sucursalId:string;lineaId:string;motivo:string}
export interface BankReverseInput{operationId:string;sucursalId:string;movimientoId:string;motivo:string}
export interface BankQuery{sucursalId:string;cuentaFinancieraId:string;page:number;limit:number;estado?:'PENDIENTE'|'CONCILIADO'}
