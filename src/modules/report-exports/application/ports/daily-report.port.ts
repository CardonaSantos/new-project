import type {Principal} from '../../../auth/application/auth.service.js';
import type {DailyReportQuery} from '../contracts/daily-report.types.js';

export interface DailyReportSnapshot{
 sucursal:{id:string;nombre:string};
 currency:string;
 fecha:string;
 zonaHoraria:'America/Guatemala';
 generatedAt:string;
 ventas:{
  totalBruto:string;descuentos:string;totalNeto:string;cantidadVentas:number;
  porMetodoPago:Array<{metodo:string;cobrado:string;reembolsado:string;neto:string;cantidad:number}>;
 };
 ordenes:{
  abiertasHoyPorEstado:Array<{estado:string;cantidad:number}>;
  cerradasHoy:number;
  canceladasHoy:number;
  porModalidad:Array<{modalidad:string;cantidad:number}>;
 };
 clientes:{
  atendidosHoy:number;
  nuevosHoy:number;
  topGasto:Array<{clienteId:string;nombre:string;totalGastado:string;cantidadVentas:number}>;
 };
 ganancias:{
  ventasNetas:string;
  costoConsumoInventario:string;
  margenBrutoEstimado:string;
  nota:string;
 };
 caja:{
  entradas:string;
  salidas:string;
  gastosPorCategoria:Array<{categoria:string;total:string}>;
  turnos:{
   total:number;abiertos:number;cerrados:number;
   fondoInicial:string;efectivoEsperado:string;efectivoContado:string;diferencia:string;
  };
 };
 inventario:{
  movimientosPorTipo:Array<{tipo:string;cantidad:string;costoTotal:string}>;
  topArticulos:Array<{articuloId:string;nombre:string;costoTotalMovido:string}>;
 };
 reservaciones:{
  porEstado:Array<{estado:string;cantidad:number}>;
  llevadasACabo:Array<{id:string;nombreContacto:string;personas:number;inicio:string;estado:string}>;
 };
}
export abstract class DailyReportPort{
 abstract snapshot(u:Principal,q:DailyReportQuery):Promise<DailyReportSnapshot>;
}
