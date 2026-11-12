import PDFDocument from 'pdfkit';
import type {ProfitabilityReportSnapshot} from './ports/profitability-report.port.js';
import {W,H,M,INNER,navy,ink,muted,stripe,white,header,footer,table,columnWidths,
 type PdfDoc} from './pdf-renderer.js';

// Summary-only PDF: totals + top-N products/categories by revenue. The full product
// list (every product sold, with its cost-coverage count) is Excel-only — see
// profitability-report-xlsx.ts.
const TOP_N=20;

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
}
function periodLabel(tipo:string){
 return ({DIA:'Día',SEMANA:'Semana',MES:'Mes',ANIO:'Año',PERSONALIZADO:'Personalizado'} as
  Record<string,string>)[tipo]??tipo;
}

export async function renderProfitabilityReportPdf(r:ProfitabilityReportSnapshot):Promise<Buffer>{
 const doc=new PDFDocument({size:[W,H],margin:0,bufferPages:true,autoFirstPage:false});
 const chunks:Buffer[]=[];
 doc.on('data',(c:Buffer)=>chunks.push(c));
 const done=new Promise<Buffer>((resolve,reject)=>{
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.on('error',reject);
 });
 const rango=r.periodo.desde===r.periodo.hasta?r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde.split('-').reverse().join('/')+' – '+r.periodo.hasta.split('-').reverse().join('/');
 const period=periodLabel(r.periodo.tipo).toUpperCase()+'  '+rango;

 doc.addPage({size:[W,H],margin:0});
 doc.rect(0,0,W,122).fill(navy);
 doc.rect(M,34,4,55).fill(white);
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   RENTABILIDAD',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text('Rentabilidad por producto y categoría',M+19,58);
 doc.font('Helvetica-Bold').fontSize(9).text(period,W-M-320,38,{width:320,align:'right'});
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre,M+19,95);

 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('RESUMEN DEL PERÍODO',M,142);
 const boxWidth=(INNER-36)/4;
 const headline:[string,string][]=[
  ['Ingreso neto',money(r.resumen.ingresoNeto,r.currency)],
  ['Costo (receta/consumo)',money(r.resumen.costo,r.currency)],
  ['Margen bruto',money(r.resumen.margen,r.currency)],
  ['Margen (%)',r.resumen.margenPct+'%']
 ];
 headline.forEach(([label,value],i)=>card(doc,M+i*(boxWidth+12),162,boxWidth,label,value));
 doc.font('Helvetica').fontSize(9).fillColor(r.resumen.costoCompleto?muted:'FFB45309')
  .text(r.resumen.costoCompleto?
   'Costo con receta/consumo registrado para todas las líneas vendidas.':
   'Costo registrado en '+r.resumen.lineasConCosto+' de '+r.resumen.lineasTotal+
    ' líneas vendidas; el resto queda fuera del costo total (no se asume costo cero).',
   M,250,{width:INNER});

 sectionTitle(doc,'TOP '+Math.min(TOP_N,r.categorias.length)+' CATEGORÍAS POR INGRESO',285);
 const catWidths=columnWidths(['Categoría','Ingreso neto','Costo','Margen','Margen %'],INNER);
 table(doc,['Categoría','Ingreso neto','Costo','Margen','Margen %'],
  r.categorias.slice(0,TOP_N).map(c=>[c.categoriaNombre,money(c.ingresoNeto,r.currency),
   money(c.costo,r.currency),money(c.margen,r.currency),c.margenPct+'%']),
  M,catWidths,{startY:307,maxY:H-55});

 doc.addPage({size:[W,H],margin:0});
 header(doc,r.sucursal.nombre,'TOP PRODUCTOS',period);
 sectionTitle(doc,'TOP '+Math.min(TOP_N,r.productos.length)+' PRODUCTOS POR INGRESO',96);
 const prodWidths=columnWidths(['Producto','Categoría','Ingreso neto','Costo','Margen','Margen %'],INNER);
 table(doc,['Producto','Categoría','Ingreso neto','Costo','Margen','Margen %'],
  r.productos.slice(0,TOP_N).map(p=>[p.productoNombre,p.categoriaNombre,money(p.ingresoNeto,r.currency),
   money(p.costo,r.currency),money(p.margen,r.currency),p.margenPct+'%']),
  M,prodWidths,{startY:118,maxY:H-55});
 doc.font('Helvetica').fontSize(8).fillColor(muted)
  .text('El listado completo de productos (con el detalle de líneas con/sin costo) está en el Excel.',
   M,H-58);

 if(!r.productos.length){
  doc.font('Helvetica').fontSize(11).fillColor(muted)
   .text('No hubo ventas en este período.',M,330);
 }

 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
