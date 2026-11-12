import ExcelJS from 'exceljs';
import type {ProfitabilityReportSnapshot} from './ports/profitability-report.port.js';
import {colors,titleRow,headerRow} from './xlsx-renderer.js';

function moneyFmt(currency:string){return (currency==='GTQ'?'"Q"':'"'+currency+'"')+' #,##0.00';}
function section(ws:ExcelJS.Worksheet,text:string){
 titleRow(ws,text,{size:12,bold:true,color:colors.teal,height:20});
}
function periodLabel(tipo:string){
 return ({DIA:'Día',SEMANA:'Semana',MES:'Mes',ANIO:'Año',PERSONALIZADO:'Personalizado'} as
  Record<string,string>)[tipo]??tipo;
}

export async function renderProfitabilityReportXlsx(r:ProfitabilityReportSnapshot):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt);
 const fmt=moneyFmt(r.currency);
 const rango=r.periodo.desde===r.periodo.hasta?r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde.split('-').reverse().join('/')+' al '+r.periodo.hasta.split('-').reverse().join('/');
 const costoNota=r.resumen.costoCompleto?
  'Costo con receta/consumo registrado para todas las líneas vendidas.':
  'Costo registrado en '+r.resumen.lineasConCosto+' de '+r.resumen.lineasTotal+
   ' líneas vendidas; el resto no tiene consumo de inventario asociado y su margen aquí está subestimado en costo (no se asume costo cero: solo se excluye del total).';

 const resumen=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 resumen.columns=[{width:30},{width:22},{width:30},{width:22}];
 titleRow(resumen,'GASTRO CORE  /  RENTABILIDAD POR PRODUCTO Y CATEGORÍA',
  {size:17,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(resumen,r.sucursal.nombre,{size:13,bold:true,color:colors.navy,height:24});
 titleRow(resumen,periodLabel(r.periodo.tipo)+' '+rango,{size:10,color:colors.muted,height:20});
 section(resumen,'TOTALES DEL PERÍODO');
 const rows:[string,string|number][]=[
  ['Ingreso neto',Number(r.resumen.ingresoNeto)],
  ['Costo (consumo de receta)',Number(r.resumen.costo)],
  ['Margen bruto',Number(r.resumen.margen)],
  ['Margen (%)',r.resumen.margenPct+'%']
 ];
 rows.forEach(([label,value],i)=>{
  const row=resumen.addRow([label,value]);
  if(i<3){row.getCell(2).numFmt=fmt;row.getCell(2).alignment={horizontal:'right'};}
 });
 const notaRow=resumen.addRow([costoNota]);
 resumen.mergeCells(notaRow.number,1,notaRow.number,4);
 notaRow.getCell(1).font={italic:true,size:9,
  color:{argb:r.resumen.costoCompleto?colors.muted:'FFB45309'}};
 notaRow.getCell(1).alignment={wrapText:true};

 const categorias=wb.addWorksheet('Por categoría',{views:[{state:'frozen',ySplit:4}]});
 categorias.columns=[{width:28},{width:12},{width:16},{width:18},{width:16},{width:18},
  {width:16},{width:18},{width:12}];
 titleRow(categorias,'RENTABILIDAD POR CATEGORÍA — '+periodLabel(r.periodo.tipo)+' '+rango,
  {size:15,bold:true,color:colors.navy,height:24});
 titleRow(categorias,r.sucursal.nombre,{size:10,color:colors.muted,height:18});
 const catHeaders=['Categoría','Productos','Cant. vendida','Ingreso bruto','Descuentos',
  'Ingreso neto','Costo','Margen','Margen %'];
 headerRow(categorias,catHeaders);
 r.categorias.forEach((c,i)=>{
  const row=categorias.addRow([c.categoriaNombre,c.productos,Number(c.cantidadVendida),
   Number(c.ingresoBruto),Number(c.descuentos),Number(c.ingresoNeto),Number(c.costo),
   Number(c.margen),c.margenPct+'%']);
  [4,5,6,7,8].forEach(col=>{row.getCell(col).numFmt=fmt;row.getCell(col).alignment={horizontal:'right'};});
  if(c.lineasConCosto<c.lineasTotal)row.getCell(7).font={color:{argb:'FFB45309'}};
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(r.categorias.length){
  categorias.autoFilter={from:{row:4,column:1},to:{row:4+r.categorias.length,column:catHeaders.length}};
 }

 const productos=wb.addWorksheet('Por producto',{views:[{state:'frozen',ySplit:4}]});
 productos.columns=[{width:34},{width:24},{width:16},{width:18},{width:16},{width:18},
  {width:16},{width:18},{width:12},{width:16}];
 titleRow(productos,'RENTABILIDAD POR PRODUCTO — '+periodLabel(r.periodo.tipo)+' '+rango,
  {size:15,bold:true,color:colors.navy,height:24});
 titleRow(productos,r.productosTruncado?
  'Mostrando los primeros '+r.productos.length+' productos por ingreso bruto; hay más en este período.':
  'Ordenado por ingreso bruto, de mayor a menor.',
  {size:9,color:r.productosTruncado?'FFB45309':colors.muted,height:18});
 const prodHeaders=['Producto','Categoría','Cant. vendida','Ingreso bruto','Descuentos',
  'Ingreso neto','Costo','Margen','Margen %','Líneas con costo'];
 headerRow(productos,prodHeaders);
 r.productos.forEach((p,i)=>{
  const row=productos.addRow([p.productoNombre,p.categoriaNombre,Number(p.cantidadVendida),
   Number(p.ingresoBruto),Number(p.descuentos),Number(p.ingresoNeto),Number(p.costo),
   Number(p.margen),p.margenPct+'%',p.lineasConCosto+' / '+p.lineasTotal]);
  [4,5,6,7,8].forEach(col=>{row.getCell(col).numFmt=fmt;row.getCell(col).alignment={horizontal:'right'};});
  if(p.lineasConCosto<p.lineasTotal){
   row.getCell(7).font={color:{argb:'FFB45309'}};row.getCell(10).font={color:{argb:'FFB45309'}};
  }
  if(i%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
 });
 if(!r.productos.length){
  const row=productos.addRow(['(sin ventas en el período)']);
  productos.mergeCells(row.number,1,row.number,prodHeaders.length);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }else{
  productos.autoFilter={from:{row:4,column:1},to:{row:4+r.productos.length,column:prodHeaders.length}};
 }

 const buf=await wb.xlsx.writeBuffer();
 return Buffer.from(buf);
}
