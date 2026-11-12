import ExcelJS from 'exceljs';
import type {DailyReportSnapshot} from './ports/daily-report.port.js';
import {colors,titleRow,headerRow} from './xlsx-renderer.js';

// Separate from xlsx-renderer.ts's generic flat-table workbook: the daily report is a
// multi-section snapshot (ventas/órdenes/clientes/ganancias/caja/inventario/reservas), not
// a single list of records, so it gets its own sheet layout. Shares the same color/row
// helpers for a consistent look.

function moneyFmt(currency:string){return (currency==='GTQ'?'"Q"':'"'+currency+'"')+' #,##0.00';}
function simpleTable(ws:ExcelJS.Worksheet,headers:string[],rows:(string|number)[][],
 moneyCols:number[],currency:string){
 headerRow(ws,headers);
 rows.forEach((row,i)=>{
  const r=ws.addRow(row);
  r.eachCell((cell,col)=>{
   if(moneyCols.includes(col-1)){cell.numFmt=moneyFmt(currency);cell.alignment={horizontal:'right'};}
   if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};
  });
 });
 if(!rows.length){
  const r=ws.addRow(['(sin datos)']);
  ws.mergeCells(r.number,1,r.number,headers.length);
  r.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }
}
function section(ws:ExcelJS.Worksheet,text:string){
 titleRow(ws,text,{size:12,bold:true,color:colors.teal,height:20});
}

export async function renderDailyReportXlsx(r:DailyReportSnapshot):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt);
 const fechaFmt=r.fecha.split('-').reverse().join('/');

 const resumen=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 resumen.columns=[{width:32},{width:22},{width:32},{width:22}];
 titleRow(resumen,'GASTRO CORE  /  REPORTE DEL DÍA',{size:19,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(resumen,'Día '+fechaFmt+'  (Guatemala, 00:00–23:59)',{size:13,bold:true,color:colors.navy,height:24});
 titleRow(resumen,r.sucursal.nombre+'  |  Moneda: '+r.currency,{size:11,color:colors.muted,height:20});
 section(resumen,'RESULTADOS PRINCIPALES');
 const metricFmt=moneyFmt(r.currency);
 const metrics:[string,string|number][]=[
  ['Ventas netas',r.ventas.totalNeto],['Ganancia bruta estimada',r.ganancias.margenBrutoEstimado],
  ['Entradas de caja',r.caja.entradas],['Salidas de caja',r.caja.salidas],
  ['Clientes atendidos',r.clientes.atendidosHoy],['Clientes nuevos',r.clientes.nuevosHoy],
  ['Turnos de caja',r.caja.turnos.total],['Reservaciones llevadas a cabo',r.reservaciones.llevadasACabo.length]
 ];
 for(let i=0;i<metrics.length;i+=2){
  const [la,va]=metrics[i],[lb,vb]=metrics[i+1]??['',''];
  const row=resumen.addRow([la,va,lb,vb]);
  row.height=20;
  const moneyKeys=new Set(['Ventas netas','Ganancia bruta estimada','Entradas de caja','Salidas de caja']);
  if(moneyKeys.has(la))row.getCell(2).numFmt=metricFmt;
  if(moneyKeys.has(lb))row.getCell(4).numFmt=metricFmt;
  row.getCell(1).font={bold:true};row.getCell(3).font={bold:true};
  row.getCell(2).alignment={horizontal:'right'};row.getCell(4).alignment={horizontal:'right'};
 }
 section(resumen,'Este informe cubre únicamente el '+fechaFmt+' (hora Guatemala).');

 const ventas=wb.addWorksheet('Ventas',{views:[{state:'frozen',ySplit:6}]});
 ventas.columns=[{width:22},{width:18},{width:18},{width:18},{width:14}];
 titleRow(ventas,'VENTAS DEL DÍA — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 const vr=ventas.addRow(['Total bruto',Number(r.ventas.totalBruto),'Descuentos',Number(r.ventas.descuentos),'']);
 vr.getCell(2).numFmt=metricFmt;vr.getCell(4).numFmt=metricFmt;
 const vr2=ventas.addRow(['Total neto',Number(r.ventas.totalNeto),'Cantidad de ventas',r.ventas.cantidadVentas,'']);
 vr2.getCell(2).numFmt=metricFmt;
 ventas.addRow([]);
 section(ventas,'Por método de pago');
 simpleTable(ventas,['Método','Cobrado','Reembolsado','Neto','Cantidad'],
  r.ventas.porMetodoPago.map(m=>[m.metodo,Number(m.cobrado),Number(m.reembolsado),Number(m.neto),m.cantidad]),
  [1,2,3],r.currency);

 const ordenes=wb.addWorksheet('Órdenes',{views:[{state:'frozen',ySplit:2}]});
 ordenes.columns=[{width:22},{width:16}];
 titleRow(ordenes,'ÓRDENES DEL DÍA — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 section(ordenes,'Abiertas hoy, por estado actual');
 simpleTable(ordenes,['Estado','Cantidad'],r.ordenes.abiertasHoyPorEstado.map(o=>[o.estado,o.cantidad]),[],r.currency);
 section(ordenes,'Por modalidad (abiertas hoy)');
 simpleTable(ordenes,['Modalidad','Cantidad'],r.ordenes.porModalidad.map(o=>[o.modalidad,o.cantidad]),[],r.currency);
 ordenes.addRow([]);
 ordenes.addRow(['Cerradas hoy',r.ordenes.cerradasHoy]);
 ordenes.addRow(['Canceladas hoy',r.ordenes.canceladasHoy]);

 const clientes=wb.addWorksheet('Clientes',{views:[{state:'frozen',ySplit:2}]});
 clientes.columns=[{width:26},{width:20},{width:16}];
 titleRow(clientes,'CLIENTES — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 clientes.addRow(['Atendidos hoy',r.clientes.atendidosHoy]);
 clientes.addRow(['Nuevos hoy',r.clientes.nuevosHoy]);
 clientes.addRow([]);
 section(clientes,'Top 5 por gasto del día');
 simpleTable(clientes,['Cliente','Total gastado','Cantidad de ventas'],
  r.clientes.topGasto.map(c=>[c.nombre,Number(c.totalGastado),c.cantidadVentas]),[1],r.currency);

 const ganancias=wb.addWorksheet('Ganancias');
 ganancias.columns=[{width:32},{width:22}];
 titleRow(ganancias,'GANANCIAS (ESTIMADO) — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 const g1=ganancias.addRow(['Ventas netas',Number(r.ganancias.ventasNetas)]);g1.getCell(2).numFmt=metricFmt;
 const g2=ganancias.addRow(['Costo de consumo de inventario',Number(r.ganancias.costoConsumoInventario)]);
 g2.getCell(2).numFmt=metricFmt;
 const g3=ganancias.addRow(['Ganancia bruta estimada',Number(r.ganancias.margenBrutoEstimado)]);
 g3.getCell(2).numFmt=metricFmt;g3.getCell(1).font={bold:true};g3.getCell(2).font={bold:true};
 ganancias.addRow([]);
 const note=ganancias.addRow([r.ganancias.nota]);
 ganancias.mergeCells(note.number,1,note.number,2);
 note.getCell(1).font={italic:true,color:{argb:colors.muted}};
 note.getCell(1).alignment={wrapText:true};
 note.height=40;

 const caja=wb.addWorksheet('Caja');
 caja.columns=[{width:28},{width:20}];
 titleRow(caja,'ENTRADAS, SALIDAS Y TURNOS DE CAJA — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 const c1=caja.addRow(['Entradas',Number(r.caja.entradas)]);c1.getCell(2).numFmt=metricFmt;
 const c2=caja.addRow(['Salidas',Number(r.caja.salidas)]);c2.getCell(2).numFmt=metricFmt;
 caja.addRow([]);
 section(caja,'Gastos operativos por categoría');
 simpleTable(caja,['Categoría','Total'],r.caja.gastosPorCategoria.map(g=>[g.categoria,Number(g.total)]),
  [1],r.currency);
 caja.addRow([]);
 section(caja,'Turnos de caja');
 caja.addRow(['Total de turnos',r.caja.turnos.total]);
 caja.addRow(['Abiertos',r.caja.turnos.abiertos]);
 caja.addRow(['Cerrados',r.caja.turnos.cerrados]);
 const cf=caja.addRow(['Fondo inicial (suma)',Number(r.caja.turnos.fondoInicial)]);cf.getCell(2).numFmt=metricFmt;
 const ce=caja.addRow(['Efectivo esperado (suma)',Number(r.caja.turnos.efectivoEsperado)]);ce.getCell(2).numFmt=metricFmt;
 const cc=caja.addRow(['Efectivo contado (suma)',Number(r.caja.turnos.efectivoContado)]);cc.getCell(2).numFmt=metricFmt;
 const cd=caja.addRow(['Diferencia (suma)',Number(r.caja.turnos.diferencia)]);cd.getCell(2).numFmt=metricFmt;

 const inv=wb.addWorksheet('Inventario',{views:[{state:'frozen',ySplit:2}]});
 inv.columns=[{width:26},{width:16},{width:18}];
 titleRow(inv,'INVENTARIO / KARDEX — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 section(inv,'Movimientos por tipo');
 simpleTable(inv,['Tipo','Cantidad','Costo total'],
  r.inventario.movimientosPorTipo.map(m=>[m.tipo,Number(m.cantidad),Number(m.costoTotal)]),[2],r.currency);
 inv.addRow([]);
 section(inv,'Top 10 artículos por valor movido');
 simpleTable(inv,['Artículo','Costo total movido',''],
  r.inventario.topArticulos.map(a=>[a.nombre,Number(a.costoTotalMovido),'']),[1],r.currency);

 const res=wb.addWorksheet('Reservaciones',{views:[{state:'frozen',ySplit:2}]});
 res.columns=[{width:16},{width:28},{width:12},{width:22},{width:16}];
 titleRow(res,'RESERVACIONES — '+fechaFmt,{size:16,bold:true,color:colors.navy,height:24});
 section(res,'Por estado');
 simpleTable(res,['Estado','Cantidad'],r.reservaciones.porEstado.map(x=>[x.estado,x.cantidad]),[],r.currency);
 res.addRow([]);
 section(res,'Llevadas a cabo (confirmadas o completadas)');
 headerRow(res,['Contacto','Personas','Inicio','Estado']);
 r.reservaciones.llevadasACabo.forEach((x,i)=>{
  const row=res.addRow([x.nombreContacto,x.personas,new Date(x.inicio).toLocaleString('es-GT',
   {timeZone:'America/Guatemala'}),x.estado]);
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(!r.reservaciones.llevadasACabo.length){
  const row=res.addRow(['(sin reservaciones confirmadas o completadas este día)']);
  res.mergeCells(row.number,1,row.number,4);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }

 const buf=await wb.xlsx.writeBuffer();
 return Buffer.from(buf);
}
