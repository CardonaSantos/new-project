import ExcelJS from 'exceljs';
import type {SalesReportSnapshot} from './ports/sales-report.port.js';
import {colors,titleRow,headerRow} from './xlsx-renderer.js';

function moneyFmt(currency:string){return (currency==='GTQ'?'"Q"':'"'+currency+'"')+' #,##0.00';}
function section(ws:ExcelJS.Worksheet,text:string){
 titleRow(ws,text,{size:12,bold:true,color:colors.teal,height:20});
}
function periodLabel(tipo:string){
 return ({DIA:'Día',SEMANA:'Semana',MES:'Mes',ANIO:'Año',PERSONALIZADO:'Personalizado'} as
  Record<string,string>)[tipo]??tipo;
}

export async function renderSalesReportXlsx(r:SalesReportSnapshot):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt);
 const fmt=moneyFmt(r.currency);
 const rango=r.periodo.desde===r.periodo.hasta?
  r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde.split('-').reverse().join('/')+' al '+r.periodo.hasta.split('-').reverse().join('/');

 const resumen=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 resumen.columns=[{width:30},{width:22},{width:30},{width:22}];
 titleRow(resumen,'GASTRO CORE  /  REPORTE DE VENTAS',{size:19,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(resumen,periodLabel(r.periodo.tipo)+': '+rango,{size:13,bold:true,color:colors.navy,height:24});
 titleRow(resumen,r.sucursal.nombre+'  |  Moneda: '+r.currency,{size:11,color:colors.muted,height:20});
 section(resumen,'RESUMEN DEL PERÍODO');
 const pairs:[string,string|number][]=[
  ['Ventas brutas',Number(r.resumen.ventasBrutas)],['Descuentos',Number(r.resumen.descuentos)],
  ['Ventas netas',Number(r.resumen.ventasNetas)],['Cantidad de ventas',r.resumen.cantidadVentas],
  ['Cobrado (pagos)',Number(r.resumen.cobrado)],['Reembolsado',Number(r.resumen.reembolsado)],
  ['Dinero entrante (cobrado - reembolsado)',Number(r.resumen.dineroEntrante)],
  ['Órdenes cerradas',r.resumen.ordenesCerradas],['Órdenes canceladas',r.resumen.ordenesCanceladas]
 ];
 const moneyLabels=new Set(['Ventas brutas','Descuentos','Ventas netas','Cobrado (pagos)','Reembolsado',
  'Dinero entrante (cobrado - reembolsado)']);
 for(let i=0;i<pairs.length;i+=2){
  const [la,va]=pairs[i],[lb,vb]=pairs[i+1]??['',''];
  const row=resumen.addRow([la,va,lb,vb]);
  row.height=20;
  if(moneyLabels.has(la))row.getCell(2).numFmt=fmt;
  if(moneyLabels.has(lb))row.getCell(4).numFmt=fmt;
  row.getCell(1).font={bold:true};row.getCell(3).font={bold:true};
  row.getCell(2).alignment={horizontal:'right'};row.getCell(4).alignment={horizontal:'right'};
 }
 section(resumen,'Por método de pago');
 headerRow(resumen,['Método','Cobrado','Reembolsado','Neto','Cantidad']);
 r.porMetodoPago.forEach((m,i)=>{
  const row=resumen.addRow([m.metodo,Number(m.cobrado),Number(m.reembolsado),Number(m.neto),m.cantidad]);
  [2,3,4].forEach(c=>{row.getCell(c).numFmt=fmt;row.getCell(c).alignment={horizontal:'right'};});
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });

 const diario=wb.addWorksheet('Serie diaria',{views:[{state:'frozen',ySplit:4}]});
 diario.columns=[{width:14},{width:16},{width:14},{width:16},{width:12},{width:16},
  {width:14},{width:16},{width:16}];
 titleRow(diario,'VENTAS POR DÍA — '+periodLabel(r.periodo.tipo)+': '+rango,
  {size:16,bold:true,color:colors.navy,height:24});
 titleRow(diario,r.sucursal.nombre,{size:11,color:colors.teal,height:18});
 titleRow(diario,'Cada fila es un día calendario (hora Guatemala).',{size:9,color:colors.muted,height:18});
 const headers=['Fecha','Ventas brutas','Descuentos','Ventas netas','Cant. ventas',
  'Cobrado','Reembolsado','Dinero entrante','Órdenes cerradas'];
 headerRow(diario,headers);
 r.serieDiaria.forEach((d,i)=>{
  const row=diario.addRow([d.fecha,Number(d.ventasBrutas),Number(d.descuentos),Number(d.ventasNetas),
   d.cantidadVentas,Number(d.cobrado),Number(d.reembolsado),Number(d.dineroEntrante),d.ordenesCerradas]);
  [2,3,4,6,7,8].forEach(c=>{row.getCell(c).numFmt=fmt;row.getCell(c).alignment={horizontal:'right'};});
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(r.serieDiaria.length){
  diario.autoFilter={from:{row:4,column:1},to:{row:4+r.serieDiaria.length,column:headers.length}};
 }

 const buf=await wb.xlsx.writeBuffer();
 return Buffer.from(buf);
}
