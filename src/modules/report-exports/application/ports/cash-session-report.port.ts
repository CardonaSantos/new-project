import type {Principal} from '../../../auth/application/auth.service.js';
import type {CashSessionReportQuery} from '../contracts/cash-session-report.types.js';

export interface CashSessionRow{
 turnoId:string;caja:string;cajero:string;fechaOperativa:string;
 abiertaEn:string;cerradaEn:string;estado:'ABIERTO'|'CERRADO';
 fondoInicial:string;efectivoEsperado:string;efectivoContado:string;diferencia:string;
 fuenteArqueo:'ARQUEO_CAJA'|'TURNO_CAJA'|'SIN_DATOS';
 realizadoPor:string;notaArqueo:string;
 porMetodoPago:Array<{metodo:string;monto:string;cantidad:number}>;
 ingresos:string;egresos:string;gastosDelTurno:string;
}
export interface CashSessionReportSnapshot{
 sucursal:{id:string;nombre:string};
 currency:string;
 periodo:{tipo:string;desde:string;hasta:string};
 generatedAt:string;
 resumen:{
  totalTurnos:number;abiertos:number;cerrados:number;
  fondoInicial:string;efectivoEsperado:string;efectivoContado:string;diferencia:string;
  turnosConDiferencia:number;
 };
 turnos:CashSessionRow[];
}
export abstract class CashSessionReportPort{
 abstract snapshot(u:Principal,q:CashSessionReportQuery):Promise<CashSessionReportSnapshot>;
}
