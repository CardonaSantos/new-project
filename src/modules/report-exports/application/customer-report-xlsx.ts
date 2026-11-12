import ExcelJS from 'exceljs';
import type {CustomerReportSnapshot} from './ports/customer-report.port.js';
import {colors,titleRow,headerRow} from './xlsx-renderer.js';

function moneyFmt(currency:string){return (currency==='GTQ'?'"Q"':'"'+currency+'"')+' #,##0.00';}
function section(ws:ExcelJS.Worksheet,text:string){
 titleRow(ws,text,{size:12,bold:true,color:colors.teal,height:20});
}
function fechaCorta(iso:string){return iso?iso.slice(0,10).split('-').reverse().join('/'):'';}

export async function renderCustomerReportXlsx(r:CustomerReportSnapshot):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt);
 const fmt=moneyFmt(r.currency);

 const resumen=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 resumen.columns=[{width:28},{width:16},{width:28},{width:16}];
 titleRow(resumen,'GASTRO CORE  /  REPORTE DE CLIENTES',{size:19,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(resumen,r.sucursal.nombre,{size:13,bold:true,color:colors.navy,height:24});
 titleRow(resumen,'Filtro: '+(r.filtros.soloActivos?'solo activos':'todos')+
  '  |  Máximo '+r.filtros.limite+' clientes (ordenado por gasto)',{size:10,color:colors.muted,height:20});
 section(resumen,'RESUMEN');
 resumen.addRow(['Total de clientes de esta sucursal',r.resumen.totalClientes]);
 resumen.addRow(['Activos',r.resumen.clientesActivos,'Inactivos',r.resumen.clientesInactivos]);
 resumen.addRow(['Con compras registradas',r.resumen.clientesConCompras]);
 resumen.addRow(['Clientes en este reporte',r.clientes.length]);

 const ws=wb.addWorksheet('Clientes',{views:[{state:'frozen',ySplit:4}]});
 const columns=[
  {header:'Cliente',width:28},{header:'NIT',width:16},{header:'Teléfono',width:16},
  {header:'Email',width:26},{header:'Activo',width:10},{header:'Registrado',width:14},
  {header:'Dirección principal',width:34},{header:'# Direcciones',width:14},
  {header:'Compras',width:12},{header:'Total gastado',width:16},{header:'Ticket promedio',width:16},
  {header:'Primera compra',width:14},{header:'Última compra',width:14},
  {header:'Órdenes',width:12},{header:'Órdenes canceladas',width:16},
  {header:'Reservas',width:12},{header:'No asistió',width:12},{header:'Notas',width:30}
 ];
 ws.columns=columns.map(c=>({width:c.width}));
 titleRow(ws,'CLIENTES — '+r.sucursal.nombre,{size:16,bold:true,color:colors.navy,height:24});
 titleRow(ws,'Ordenado por gasto histórico en esta sucursal, de mayor a menor.',
  {size:9,color:colors.muted,height:18});
 headerRow(ws,columns.map(c=>c.header));
 const moneyCols=[10,11];
 r.clientes.forEach((c,i)=>{
  const row=ws.addRow([c.nombre,c.nit,c.telefono,c.email,c.activo?'Sí':'No',fechaCorta(c.registradoEn),
   c.direccionPrincipal,c.cantidadDirecciones,c.cantidadVentas,Number(c.totalGastado),
   Number(c.ticketPromedio),fechaCorta(c.primeraCompra),fechaCorta(c.ultimaCompra),
   c.cantidadOrdenes,c.ordenesCanceladas,c.cantidadReservas,c.reservasNoAsistio,c.notas]);
  row.eachCell((cell,col)=>{
   if(moneyCols.includes(col)){cell.numFmt=fmt;cell.alignment={horizontal:'right'};}
   if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};
  });
 });
 if(!r.clientes.length){
  const row=ws.addRow(['(sin clientes para los filtros seleccionados)']);
  ws.mergeCells(row.number,1,row.number,columns.length);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }else{
  ws.autoFilter={from:{row:4,column:1},to:{row:4+r.clientes.length,column:columns.length}};
 }

 const buf=await wb.xlsx.writeBuffer();
 return Buffer.from(buf);
}
