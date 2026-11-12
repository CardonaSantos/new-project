import PDFDocument from 'pdfkit';
import type {SalesReportSnapshot} from './ports/sales-report.port.js';
import {W,H,M,INNER,navy,ink,muted,line,stripe,white,header,footer,table,columnWidths,
 type PdfDoc} from './pdf-renderer.js';

// Summary-only PDF, same decision as the daily report: a full daily row-by-row table for
// a whole year would be ~365 rows, so periods longer than a month get aggregated to
// monthly buckets here; the complete daily series is always in the XLSX.

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
function periodLabel(tipo:string){
 return ({DIA:'Día',SEMANA:'Semana',MES:'Mes',ANIO:'Año',PERSONALIZADO:'Personalizado'} as
  Record<string,string>)[tipo]??tipo;
}
function monthlyBuckets(r:SalesReportSnapshot){
 const byMonth=new Map<string,{ventasNetas:number;dineroEntrante:number;ordenes:number}>();
 for(const d of r.serieDiaria){
  const key=d.fecha.slice(0,7);
  const row=byMonth.get(key)??{ventasNetas:0,dineroEntrante:0,ordenes:0};
  row.ventasNetas+=Number(d.ventasNetas);row.dineroEntrante+=Number(d.dineroEntrante);
  row.ordenes+=d.ordenesCerradas;
  byMonth.set(key,row);
 }
 return [...byMonth.entries()].sort(([a],[b])=>a.localeCompare(b));
}

export async function renderSalesReportPdf(r:SalesReportSnapshot):Promise<Buffer>{
 const doc=new PDFDocument({size:[W,H],margin:0,bufferPages:true,autoFirstPage:false});
 const chunks:Buffer[]=[];
 doc.on('data',(c:Buffer)=>chunks.push(c));
 const done=new Promise<Buffer>((resolve,reject)=>{
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.on('error',reject);
 });
 const rango=r.periodo.desde===r.periodo.hasta?
  r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde.split('-').reverse().join('/')+' – '+r.periodo.hasta.split('-').reverse().join('/');
 const period=periodLabel(r.periodo.tipo).toUpperCase()+'  '+rango;

 doc.addPage({size:[W,H],margin:0});
 doc.rect(0,0,W,122).fill(navy);
 doc.rect(M,34,4,55).fill(white);
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   REPORTE DE VENTAS',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text('Reporte de ventas',M+19,58);
 doc.font('Helvetica-Bold').fontSize(9).text(period,W-M-320,38,{width:320,align:'right'});
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre+'  |  Moneda '+r.currency,M+19,95);

 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('RESUMEN DEL PERÍODO',M,142);
 const boxWidth=(INNER-36)/4;
 const headline:[string,string][]=[
  ['Ventas netas',money(r.resumen.ventasNetas,r.currency)],
  ['Dinero entrante',money(r.resumen.dineroEntrante,r.currency)],
  ['Cantidad de ventas',String(r.resumen.cantidadVentas)],
  ['Órdenes cerradas',String(r.resumen.ordenesCerradas)]
 ];
 headline.forEach(([label,value],i)=>card(doc,M+i*(boxWidth+12),162,boxWidth,label,value));
 const extras:[string,string][]=[
  ['Ventas brutas',money(r.resumen.ventasBrutas,r.currency)],
  ['Descuentos',money(r.resumen.descuentos,r.currency)],
  ['Reembolsado',money(r.resumen.reembolsado,r.currency)],
  ['Órdenes canceladas',String(r.resumen.ordenesCanceladas)]
 ];
 extras.forEach(([label,value],i)=>{
  const xx=M+(i%2)*(INNER/2),yy=250+Math.floor(i/2)*38;
  doc.font('Helvetica').fontSize(10).fillColor(muted).text(label,xx,yy,{width:260});
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(value,xx+260,yy,{width:120});
 });

 sectionTitle(doc,'VENTAS POR MÉTODO DE PAGO',335);
 const payWidths=columnWidths(['Método','Cobrado','Reembolsado','Neto','Cantidad'],INNER);
 table(doc,['Método','Cobrado','Reembolsado','Neto','Cantidad'],
  r.porMetodoPago.map(m=>[m.metodo,money(m.cobrado,r.currency),money(m.reembolsado,r.currency),
   money(m.neto,r.currency),String(m.cantidad)]),
  M,payWidths,{startY:358,maxY:H-55});

 doc.addPage({size:[W,H],margin:0});
 header(doc,r.sucursal.nombre,'EVOLUCIÓN',period);
 if(r.serieDiaria.length<=31){
  sectionTitle(doc,'VENTAS POR DÍA',96);
  const widths=columnWidths(['Fecha','Ventas netas','Dinero entrante','Órdenes'],INNER);
  table(doc,['Fecha','Ventas netas','Dinero entrante','Órdenes'],
   r.serieDiaria.map(d=>[d.fecha.split('-').reverse().join('/'),money(d.ventasNetas,r.currency),
    money(d.dineroEntrante,r.currency),String(d.ordenesCerradas)]),
   M,widths,{startY:118,maxY:H-55});
 }else{
  sectionTitle(doc,'VENTAS POR MES',96);
  doc.font('Helvetica').fontSize(9).fillColor(muted)
   .text('El período cubre más de un mes; el detalle diario completo está en el Excel.',M,114);
  const widths=columnWidths(['Mes','Ventas netas','Dinero entrante','Órdenes cerradas'],INNER);
  table(doc,['Mes','Ventas netas','Dinero entrante','Órdenes cerradas'],
   monthlyBuckets(r).map(([mes,v])=>[mes,money(v.ventasNetas.toFixed(2),r.currency),
    money(v.dineroEntrante.toFixed(2),r.currency),String(v.ordenes)]),
   M,widths,{startY:136,maxY:H-55});
 }

 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
