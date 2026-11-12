import PDFDocument from 'pdfkit';
import type {DailyReportSnapshot} from './ports/daily-report.port.js';
import {W,H,M,INNER,navy,teal,ink,muted,line,stripe,white,header,footer,table,columnWidths,
 type PdfDoc} from './pdf-renderer.js';

// By explicit decision: the daily-report PDF is a SUMMARY only (totals, breakdowns by
// category, top-N lists). The full row-by-row detail (e.g. every inventory movement)
// only ever goes in the XLSX — see daily-report-xlsx.ts.

function money(v:string,currency:string){
 const n=Number(v),symbol=currency==='GTQ'?'Q':currency;
 return symbol+' '+n.toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function card(doc:PdfDoc,x:number,y:number,w:number,label:string,value:string){
 doc.rect(x,y,w,72).fill(stripe);
 doc.font('Helvetica').fontSize(9).fillColor(muted).text(label,x+10,y+14,{width:w-20});
 doc.font('Helvetica-Bold').fontSize(14).fillColor(ink).text(value,x+10,y+34,{width:w-20});
}
function sectionTitle(doc:PdfDoc,text:string,y:number){
 doc.font('Helvetica-Bold').fontSize(13).fillColor(navy).text(text,M,y);
 doc.moveTo(M,y+18).lineTo(W-M,y+18).strokeColor(line).lineWidth(0.6).stroke();
}

export async function renderDailyReportPdf(r:DailyReportSnapshot):Promise<Buffer>{
 const doc=new PDFDocument({size:[W,H],margin:0,bufferPages:true,autoFirstPage:false});
 const chunks:Buffer[]=[];
 doc.on('data',(c:Buffer)=>chunks.push(c));
 const done=new Promise<Buffer>((resolve,reject)=>{
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.on('error',reject);
 });
 const fechaFmt=r.fecha.split('-').reverse().join('/');
 const period='DÍA '+fechaFmt+' (GT)';

 // Page 1: cover + headline metrics
 doc.addPage({size:[W,H],margin:0});
 doc.rect(0,0,W,122).fill(navy);
 doc.rect(M,34,4,55).fill(white);
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   REPORTE DEL DÍA',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text('Reporte del día',M+19,58);
 doc.font('Helvetica-Bold').fontSize(9).text(period,W-M-260,38,{width:260,align:'right'});
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre+'  |  Moneda '+r.currency,M+19,95);

 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('RESULTADOS DEL DÍA',M,142);
 const boxWidth=(INNER-36)/4;
 const headline:[string,string][]=[
  ['Ventas netas',money(r.ventas.totalNeto,r.currency)],
  ['Ganancia bruta estimada',money(r.ganancias.margenBrutoEstimado,r.currency)],
  ['Entradas de caja',money(r.caja.entradas,r.currency)],
  ['Salidas de caja',money(r.caja.salidas,r.currency)]
 ];
 headline.forEach(([label,value],i)=>card(doc,M+i*(boxWidth+12),162,boxWidth,label,value));
 const extras:[string,string][]=[
  ['Clientes atendidos',String(r.clientes.atendidosHoy)],
  ['Clientes nuevos',String(r.clientes.nuevosHoy)],
  ['Turnos de caja (abiertos/cerrados)',r.caja.turnos.abiertos+' / '+r.caja.turnos.cerrados],
  ['Reservaciones llevadas a cabo',String(r.reservaciones.llevadasACabo.length)]
 ];
 extras.forEach(([label,value],i)=>{
  const xx=M+(i%2)*(INNER/2),yy=250+Math.floor(i/2)*38;
  doc.font('Helvetica').fontSize(10).fillColor(muted).text(label,xx,yy,{width:260});
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(value,xx+260,yy,{width:120});
 });

 sectionTitle(doc,'VENTAS POR MÉTODO DE PAGO',335);
 const payWidths=columnWidths(['Método','Cobrado','Reembolsado','Neto','Cantidad'],INNER);
 table(doc,['Método','Cobrado','Reembolsado','Neto','Cantidad'],
  r.ventas.porMetodoPago.map(m=>[m.metodo,money(m.cobrado,r.currency),
   money(m.reembolsado,r.currency),money(m.neto,r.currency),String(m.cantidad)]),
  M,payWidths,{startY:358,maxY:H-55});

 doc.font('Helvetica').fontSize(8).fillColor(muted)
  .text('El detalle fila por fila (inventario, clientes, órdenes) está disponible en el Excel.',M,H-58);

 // Page 2: órdenes, clientes, inventario, reservaciones (summaries)
 doc.addPage({size:[W,H],margin:0});
 header(doc,r.sucursal.nombre,'RESUMEN OPERATIVO',period);
 sectionTitle(doc,'ÓRDENES DEL DÍA',96);
 const estadoWidths=columnWidths(['Estado','Cantidad'],INNER/2-10);
 table(doc,['Estado','Cantidad'],r.ordenes.abiertasHoyPorEstado.map(o=>[o.estado,String(o.cantidad)]),
  M,estadoWidths,{startY:118,maxY:230});
 doc.font('Helvetica').fontSize(9).fillColor(muted)
  .text('Cerradas hoy: '+r.ordenes.cerradasHoy+'   Canceladas hoy: '+r.ordenes.canceladasHoy,M,236);

 sectionTitle(doc,'CLIENTES — TOP 5 DEL DÍA',266);
 const clientWidths=columnWidths(['Cliente','Total gastado','Ventas'],INNER);
 table(doc,['Cliente','Total gastado','Ventas'],
  r.clientes.topGasto.map(c=>[c.nombre,money(c.totalGastado,r.currency),String(c.cantidadVentas)]),
  M,clientWidths,{startY:288,maxY:400});

 sectionTitle(doc,'INVENTARIO — MOVIMIENTOS POR TIPO',420);
 const invWidths=columnWidths(['Tipo','Cantidad','Costo total'],INNER);
 table(doc,['Tipo','Cantidad','Costo total'],
  r.inventario.movimientosPorTipo.map(m=>[m.tipo,m.cantidad,money(m.costoTotal,r.currency)]),
  M,invWidths,{startY:442,maxY:H-110});

 doc.font('Helvetica').fontSize(8).fillColor(muted)
  .text('Caja, gastos por categoría y reservaciones en la siguiente página; detalle completo en el Excel.',
   M,H-58);

 // Page 3: caja + reservaciones
 doc.addPage({size:[W,H],margin:0});
 header(doc,r.sucursal.nombre,'CAJA Y RESERVACIONES',period);
 sectionTitle(doc,'CAJA',96);
 doc.font('Helvetica').fontSize(10).fillColor(ink)
  .text('Fondo inicial (suma): '+money(r.caja.turnos.fondoInicial,r.currency),M,118)
  .text('Efectivo esperado (suma): '+money(r.caja.turnos.efectivoEsperado,r.currency),M,136)
  .text('Efectivo contado (suma): '+money(r.caja.turnos.efectivoContado,r.currency),M,154)
  .text('Diferencia (suma): '+money(r.caja.turnos.diferencia,r.currency),M,172);
 const gastoWidths=columnWidths(['Categoría','Total'],INNER/2);
 table(doc,['Categoría','Total'],r.caja.gastosPorCategoria.map(g=>[g.categoria,money(g.total,r.currency)]),
  M,gastoWidths,{startY:200,maxY:330});

 sectionTitle(doc,'RESERVACIONES LLEVADAS A CABO',360);
 const resWidths=columnWidths(['Contacto','Personas','Inicio','Estado'],INNER);
 table(doc,['Contacto','Personas','Inicio','Estado'],
  r.reservaciones.llevadasACabo.map(x=>[x.nombreContacto,String(x.personas),
   new Date(x.inicio).toLocaleString('es-GT',{timeZone:'America/Guatemala'}),x.estado]),
  M,resWidths,{startY:382,maxY:H-55});

 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
