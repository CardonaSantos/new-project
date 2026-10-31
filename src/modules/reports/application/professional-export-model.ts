import {Prisma} from '../../../generated/prisma/client.js';
import type {ExportPayload} from './report-export-formats.js';

type Row=Record<string,unknown>;
export type Metric={key:string;label:string;value:string;precision:number};
export type Daily={fecha:string;[key:string]:unknown};
const titles:Record<string,string>={
 SALES_COSTS:'Costos y margen de ventas',ORDER_COST_OUTCOMES:'Costos por orden y cancelaciones',
 PREPARATION_COSTS:'Consumos y costos de preparación',
 PAYMENT_SALES_RECON:'Conciliación de cobros y ventas',
 SUPPLIER_BALANCES:'Saldos de proveedores',PLATFORM_SETTLEMENTS:'Liquidaciones de plataformas',
 BANK_MATCH_STATUS:'Conciliación bancaria',SALES_LINES:'Detalle de ventas',
 INVENTORY_MOVEMENTS:'Movimientos de inventario',
 PURCHASE_INVOICES:'Facturas de proveedores',
 PURCHASE_RECEIPT_LINES:'Recepciones de compras',
 DELIVERY_EVENTS:'Eventos de entregas',RESERVATION_EVENTS:'Eventos de reservas',
 SUPPLY_REQUESTS:'Requisiciones',SUPPLY_TRANSFERS:'Transferencias'
};
const labels:Record<string,string>={
 numeroOrden:'Orden',fecha:'Fecha operativa',producto:'Producto',
 variante:'Variante',descripcion:'Descripción',modalidad:'Modalidad',
 cantidad:'Cantidad',ingreso:'Ingresos',ingresos:'Ingresos',
 costoDirecto:'Costo directo',costoIdentificado:'Costo identificado',
 costoEmpaqueIdentificado:'Costo empaque',margenAntesEmpaque:'Margen previo a empaque',
 cobrado:'Cobrado',reembolsadoHistorico:'Reembolsos históricos',
 reembolsosDelDia:'Reembolsos del día',netoHistorico:'Neto histórico',
 estadoActual:'Estado actual',estadoOrden:'Estado orden',
 reconocimientoVenta:'Venta reconocida',documentos:'Documentos',
 documentosEmpaque:'Documentos empaque',cobertura:'Cobertura',
 saldo:'Saldo pendiente',pagosAplicados:'Pagos aplicados',
 creditosAplicados:'Créditos aplicados',total:'Total',
 bruto:'Bruto',comisiones:'Comisiones',neto:'Neto',
 importeAnulado:'Importe anulado',cuentas:'Cuentas',
 ventas:'Ventas',pagos:'Pagos',registros:'Registros',
 costoCanceladasIdentificado:'Costo órdenes canceladas',
 costoCerradasIdentificado:'Costo órdenes cerradas',
 lineasSinCosto:'Líneas sin costo',ordenesIncompletas:'Órdenes incompletas',
 facturas:'Facturas',conciliadas:'Conciliadas',pendientes:'Pendientes',
 documento:'Documento',periodoInicio:'Inicio período',periodoFin:'Fin período',
 numeroDocumento:'Factura',proveedor:'Proveedor',estadoCuenta:'Estado cuenta'
};
const favorites:Record<string,string[]>={
 SALES_COSTS:['fecha','numeroOrden','producto','variante','cantidad','ingreso','costoDirecto','margenAntesEmpaque','cobertura'],
 ORDER_COST_OUTCOMES:['numeroOrden','estadoActual','modalidad','documentos','documentosEmpaque','costoIdentificado','costoEmpaqueIdentificado','costoCompleto'],
 PAYMENT_SALES_RECON:['numeroOrden','estadoOrden','estadoCuenta','reconocimientoVenta','pagos','cobrado','reembolsadoHistorico','netoHistorico'],
 SUPPLIER_BALANCES:['numeroDocumento','proveedor','total','pagosAplicados','creditosAplicados','saldo'],
 PLATFORM_SETTLEMENTS:['creadaEn','bruto','comision','neto','recibidaEn'],
 BANK_MATCH_STATUS:['fecha','monto','conciliado','movimientoFinancieroId'],
 SALES_LINES:['fecha','numeroOrden','producto','variante','cantidad','subtotal'],
 PREPARATION_COSTS:['numeroOrden','tipo','creadoEn','costoIdentificado'],
};
const important:Record<string,string[]>={
 SALES_COSTS:['ingresos','costoDirectoIdentificado','costoIdentificado','margenAntesEmpaque','lineasSinCosto','lineasConCosto'],
 ORDER_COST_OUTCOMES:['ordenes','documentos','costoIdentificado','costoCanceladasIdentificado','costoEmpaqueIdentificado','ordenesIncompletas'],
 PAYMENT_SALES_RECON:['cobrado','reembolsadoHistorico','netoHistorico','cuentasSinVenta','cuentasConVenta','pagos'],
 SUPPLIER_BALANCES:['facturado','pagosAplicados','creditosAplicados','saldo','facturas'],
 PLATFORM_SETTLEMENTS:['bruto','comisiones','neto','liquidaciones'],
 BANK_MATCH_STATUS:['lineas','conciliadas','pendientes','movimientoExtracto']
};
export const isMoney=(key:string)=>!/^(lineas|ordenes|documentos|cuentas|registros|pagos$|ventas$|facturas$|liquidaciones$|reembolsos$)/i.test(key)&&
 /ingreso|costo|margen|saldo|cobrad|reembols|neto|bruto|total|comision|monto|importe|facturad|pagosAplicados|creditosAplicados/i.test(key);
const currency=(v:unknown,dp:number)=>new Prisma.Decimal(String(v??0)).toFixed(dp);
export const reportTitle=(r:ExportPayload)=>titles[r.source]??r.source.replace(/_/g,' ');
export const fieldLabel=(key:string)=>labels[key]??
 (key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()));
// Reports target cashiers/managers, not developers. Retain internal identifiers
// only in the authorized database source, never in delivered CSV/XLSX/PDF.
export const isVisibleField=(key:string)=>!(/(^id$|Id$|Ids$|documentosConsumo|^movimientoFinancieroId$)/i.test(key));
export const formatMoney=(value:unknown,currency='GTQ',digits=2)=>{
 if(value===null||value===undefined||value==='')return 'Sin dato';
 const valueNumber=new Prisma.Decimal(String(value));
 const prefix=currency==='GTQ'?'Q ':currency+' ';
 return prefix+valueNumber.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g,',');
};
export const reportPeriodLabel=(r:ExportPayload)=>r.periodo.desde===r.periodo.hasta?
 'REPORTE DEL DÍA • '+r.periodo.desde.split('-').reverse().join('/'):
 'REPORTE DEL PERÍODO • '+r.periodo.desde.split('-').reverse().join('/')+' AL '+
 r.periodo.hasta.split('-').reverse().join('/');
export function sourceKeys(r:ExportPayload){
 const existing=[...new Set(r.data.flatMap(row=>Object.keys(row)))].filter(isVisibleField);
 if(!existing.length)return ['sinRegistros'];
 const preferred=favorites[r.source]??[];
 const used=preferred.filter(k=>existing.includes(k));
 return [...used,...existing.filter(k=>!used.includes(k))];
}
export const str=(v:unknown):string=>{
 if(v==null)return '';
 if(v instanceof Date)return v.toISOString();
 if(typeof v==='object')return JSON.stringify(v);
 return String(v);
};
const selected=(r:ExportPayload):Metric[]=>{
 const raw=r.totales&&typeof r.totales==='object'&&!Array.isArray(r.totales)
  ?r.totales as Row:{};
 const keys=Object.keys(raw).filter(key=>{
  const v=raw[key];
  return (typeof v==='number'||typeof v==='string')&&
   /^-?\d+(?:\.\d+)?$/.test(String(v));
 });
 const order=important[r.source]??[];
 return [...order.filter(x=>keys.includes(x)),
  ...keys.filter(x=>!order.includes(x))].slice(0,16).map(key=>{
  const v=String(raw[key]),precision=v.includes('.')?v.split('.')[1].length:0;
  return {key,label:fieldLabel(key),value:v,precision:isMoney(key)?Math.max(2,Math.min(6,precision)):precision};
 });
};
export function reportMetrics(r:ExportPayload):Metric[]{
 const values=selected(r);
 if(values.length)return values;
 return [{key:'registros',label:'Registros',value:String(r.meta.total),precision:0}];
}
export function businessColumns(r:ExportPayload):string[]{
 const keys=sourceKeys(r).filter(k=>k!=='sinRegistros');
 const fav=favorites[r.source]??[];
 const main=fav.filter(k=>keys.includes(k)&&!k.endsWith('Id'));
 const remaining=keys.filter(k=>!main.includes(k)&&!k.endsWith('Id')&&!/documentosConsumo/i.test(k));
 const selected=[...main,...remaining];
 const max=6;
 const order=r.source==='SALES_COSTS'?(r.periodo.desde===r.periodo.hasta?
  ['numeroOrden','producto','cantidad','ingreso','costoDirecto','margenAntesEmpaque']:
  ['fecha','numeroOrden','producto','ingreso','costoDirecto','margenAntesEmpaque']):
  r.source==='PAYMENT_SALES_RECON'?['numeroOrden','estadoOrden','reconocimientoVenta','pagos','cobrado','netoHistorico']:
  r.source==='ORDER_COST_OUTCOMES'?['numeroOrden','estadoActual','documentos','costoIdentificado','costoEmpaqueIdentificado','costoCompleto']:[];
 if(order.length)return order.filter(k=>keys.includes(k)).slice(0,max);
 return selected.slice(0,max);
}
function dayOf(v:unknown,zone:string,cutoff:string):string|null{
 if(v==null||v==='')return null;
 const date=v instanceof Date?v:new Date(String(v));
 if(Number.isNaN(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  hourCycle:'h23'}).formatToParts(date);
 const get=(part:string)=>Number(parts.find(x=>x.type===part)?.value??0);
 const minutes=get('hour')*60+get('minute');
 const cut=cutoff.split(':').map(Number);
 const back=minutes<cut[0]*60+cut[1]?1:0;
 const local=new Date(Date.UTC(get('year'),get('month')-1,get('day')-back));
 return local.toISOString().slice(0,10);
}
const dailySources:Record<string,string>={
 SALES_COSTS:'fecha',SALES_LINES:'fecha',DELIVERY_EVENTS:'fecha',
 RESERVATION_EVENTS:'fecha',SUPPLY_TRANSFERS:'despachadaEn',
 SUPPLY_REQUESTS:'fecha',INVENTORY_MOVEMENTS:'creadoEn',
 PURCHASE_RECEIPT_LINES:'recibidoEn',PLATFORM_SETTLEMENTS:'creadaEn'
};
export function reportDaily(r:ExportPayload):{rows:Daily[];note:string}{
 if(Array.isArray(r.diario)&&r.diario.length)
  return {rows:r.diario.filter(item=>typeof item.fecha==='string')
   .map(item=>({...item,fecha:String(item.fecha)}))
   .sort((a,b)=>a.fecha.localeCompare(b.fecha)),
   note:r.diarioNota??'Fechas operativas de documentos originales.'};
 if(r.diarioNota&&!r.diario?.length&&
  ['PAYMENT_SALES_RECON','ORDER_COST_OUTCOMES','PREPARATION_COSTS'].includes(r.source))
  return {rows:[],note:r.diarioNota};
 const key=dailySources[r.source];
 if(!key)return {rows:[],note:'Esta fuente no ofrece una fecha de movimiento por registro que permita un agrupado diario verificable. No se asignaron fechas inventadas.'};
 const zone=r.periodo.zonaHoraria??'America/Guatemala',cut=r.periodo.corte??'04:00';
 const grouped=new Map<string,{registros:number;totals:Map<string,Prisma.Decimal>;incomplete:Set<string>}>();
 for(const row of r.data){
  const fecha=dayOf(row[key],zone,cut);
  if(!fecha)continue;
  let agg=grouped.get(fecha);
  if(!agg){agg={registros:0,totals:new Map(),incomplete:new Set()};grouped.set(fecha,agg);}
  agg.registros++;
  for(const [k,v] of Object.entries(row)){
   if(!isMoney(k))continue;
   if(v===null){agg.incomplete.add(k);continue;}
   if(typeof v==='string'||typeof v==='number'){
    if(!/^-?\d+(?:\.\d+)?$/.test(String(v)))continue;
    agg.totals.set(k,(agg.totals.get(k)??new Prisma.Decimal(0)).plus(String(v)));
   }
  }
 }
 const rows=[...grouped].sort((a,b)=>a[0].localeCompare(b[0])).map(([fecha,g])=>{
  const obj:Daily={fecha,registros:g.registros};
  for(const [key,number] of g.totals){
   obj[key]=g.incomplete.has(key)?null:currency(number.toString(),
    Math.max(2,Math.min(6,Math.max(...r.data.map(row=>String(row[key]??'').split('.')[1]?.length??0)))));
  }
  return obj;
 });
 return {rows,note:'Agrupación por fecha operativa del documento de origen. Costos no conciliados permanecen vacíos, nunca se convierten en cero.'};
}
export function presentationValue(v:unknown,field:string,zone='America/Guatemala',currency='GTQ'){
 if(v===null||v===undefined)return 'Sin dato';
 if(typeof v==='boolean')return v?'Sí':'No';
 if(isMoney(field)&&/^-?\\d+(?:\\.\\d+)?$/.test(String(v)))
  return formatMoney(v,currency,2);
 if(field==='cobertura')return String(v).replaceAll('_',' ');
 if(field==='reconocimientoVenta')return v==='CON_VENTA'?'Sí':'Pendiente';
 if(/fecha|En$|creadaEn|cerradaEn|canceladaEn|recibidaEn/i.test(field)){
  const raw=v instanceof Date?v.toISOString():String(v);
  if(/^\\d{4}-\\d{2}-\\d{2}$/.test(raw))return raw.split('-').reverse().join('/');
  if(/^\\d{4}-\\d{2}-\\d{2}T/.test(raw)){
   const date=new Date(raw);
   if(!Number.isNaN(date.getTime()))return new Intl.DateTimeFormat('es-GT',{timeZone:zone,
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    hourCycle:'h23'}).format(date);
  }
 }
 const value=str(v);
 return /^[A-ZÁÉÍÓÚ_]+$/.test(value)?value.replaceAll('_',' ').toLowerCase()
  .replace(/^./,c=>c.toUpperCase()):value;
}
