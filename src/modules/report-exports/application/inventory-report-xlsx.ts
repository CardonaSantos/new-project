import ExcelJS from 'exceljs';
import type {InventoryReportSnapshot} from './ports/inventory-report.port.js';
import {colors,titleRow,headerRow} from './xlsx-renderer.js';

function moneyFmt(currency:string){return (currency==='GTQ'?'"Q"':'"'+currency+'"')+' #,##0.00';}
function section(ws:ExcelJS.Worksheet,text:string){
 titleRow(ws,text,{size:12,bold:true,color:colors.teal,height:20});
}
function periodLabel(tipo:string){
 return ({DIA:'Día',SEMANA:'Semana',MES:'Mes',ANIO:'Año',PERSONALIZADO:'Personalizado'} as
  Record<string,string>)[tipo]??tipo;
}

export async function renderInventoryReportXlsx(r:InventoryReportSnapshot):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt);
 const fmt=moneyFmt(r.currency);
 const rango=r.periodo.desde===r.periodo.hasta?r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde.split('-').reverse().join('/')+' al '+r.periodo.hasta.split('-').reverse().join('/');

 const resumen=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 resumen.columns=[{width:30},{width:20},{width:30},{width:20}];
 titleRow(resumen,'GASTRO CORE  /  REPORTE DE INVENTARIO',{size:19,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(resumen,r.sucursal.nombre,{size:13,bold:true,color:colors.navy,height:24});
 titleRow(resumen,'Movimientos: '+periodLabel(r.periodo.tipo)+' '+rango+
  '  |  Stock actual: a la fecha de generación',{size:10,color:colors.muted,height:20});
 section(resumen,'EXISTENCIAS (AHORA)');
 resumen.addRow(['Artículos con stock',r.resumen.articulosConStock]);
 const vr=resumen.addRow(['Valor total de inventario',Number(r.resumen.valorTotalInventario)]);
 vr.getCell(2).numFmt=fmt;
 section(resumen,'Movimientos por tipo (en el período)');
 headerRow(resumen,['Tipo','Cantidad','Costo total']);
 r.resumen.movimientosPorTipo.forEach((m,i)=>{
  const row=resumen.addRow([m.tipo,Number(m.cantidad),Number(m.costoTotal)]);
  row.getCell(3).numFmt=fmt;row.getCell(3).alignment={horizontal:'right'};
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(!r.resumen.movimientosPorTipo.length){
  const row=resumen.addRow(['(sin movimientos en el período)']);
  resumen.mergeCells(row.number,1,row.number,3);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }

 const stock=wb.addWorksheet('Stock actual',{views:[{state:'frozen',ySplit:4}]});
 stock.columns=[{width:34},{width:20},{width:16},{width:18}];
 titleRow(stock,'STOCK ACTUAL — '+r.sucursal.nombre,{size:16,bold:true,color:colors.navy,height:24});
 titleRow(stock,'A la fecha de generación de este reporte. Ordenado por valor, de mayor a menor.',
  {size:9,color:colors.muted,height:18});
 headerRow(stock,['Artículo','Tipo','Cantidad actual','Valor actual']);
 r.stockActual.forEach((s,i)=>{
  const row=stock.addRow([s.nombre,s.tipo,Number(s.cantidadActual),Number(s.valorActual)]);
  row.getCell(4).numFmt=fmt;row.getCell(4).alignment={horizontal:'right'};
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(r.stockActual.length){
  stock.autoFilter={from:{row:4,column:1},to:{row:4+r.stockActual.length,column:4}};
 }

 const kardex=wb.addWorksheet('Kardex',{views:[{state:'frozen',ySplit:4}]});
 kardex.columns=[{width:18},{width:30},{width:20},{width:14},{width:16},{width:16},
  {width:20},{width:34}];
 titleRow(kardex,'KARDEX — '+periodLabel(r.periodo.tipo)+' '+rango,{size:16,bold:true,color:colors.navy,height:24});
 titleRow(kardex,r.kardexTruncado?
  'Mostrando los primeros '+r.kardex.length+' movimientos; hay más en este período — reduzca el rango o aumente el límite.':
  'Movimientos completos del período, en orden cronológico.',
  {size:9,color:r.kardexTruncado?'FFB45309':colors.muted,height:18});
 const kheaders=['Fecha','Artículo','Tipo','Cantidad','Costo unitario','Costo total','Origen','Nota'];
 headerRow(kardex,kheaders);
 r.kardex.forEach((k,i)=>{
  const row=kardex.addRow([new Date(k.fecha).toLocaleString('es-GT',{timeZone:'America/Guatemala'}),
   k.articulo,k.tipo,Number(k.cantidad),Number(k.costoUnitario),Number(k.costoTotal),
   k.referenciaTipo,k.nota]);
  [5,6].forEach(c=>{row.getCell(c).numFmt=fmt;row.getCell(c).alignment={horizontal:'right'};});
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(!r.kardex.length){
  const row=kardex.addRow(['(sin movimientos en el período)']);
  kardex.mergeCells(row.number,1,row.number,kheaders.length);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }else{
  kardex.autoFilter={from:{row:4,column:1},to:{row:4+r.kardex.length,column:kheaders.length}};
 }

 const buf=await wb.xlsx.writeBuffer();
 return Buffer.from(buf);
}
