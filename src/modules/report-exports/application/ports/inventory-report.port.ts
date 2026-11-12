import type {Principal} from '../../../auth/application/auth.service.js';
import type {InventoryReportQuery} from '../contracts/inventory-report.types.js';

export interface StockRow{
 articuloId:string;nombre:string;tipo:string;cantidadActual:string;valorActual:string;
}
export interface KardexLine{
 fecha:string;articulo:string;tipo:string;cantidad:string;costoUnitario:string;
 costoTotal:string;referenciaTipo:string;nota:string;
}
export interface InventoryReportSnapshot{
 sucursal:{id:string;nombre:string};
 currency:string;
 periodo:{tipo:string;desde:string;hasta:string};
 generatedAt:string;
 resumen:{
  articulosConStock:number;valorTotalInventario:string;
  movimientosPorTipo:Array<{tipo:string;cantidad:string;costoTotal:string}>;
 };
 stockActual:StockRow[];
 topMovidos:Array<{articuloId:string;nombre:string;costoTotalMovido:string}>;
 kardex:KardexLine[];
 kardexTruncado:boolean;
}
export abstract class InventoryReportPort{
 abstract snapshot(u:Principal,q:InventoryReportQuery):Promise<InventoryReportSnapshot>;
}
