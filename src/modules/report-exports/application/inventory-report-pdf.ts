import PDFDocument from 'pdfkit';
import type {InventoryReportSnapshot} from './ports/inventory-report.port.js';
import {W,H,M,INNER,navy,ink,muted,stripe,white,header,footer,table,columnWidths,
 type PdfDoc} from './pdf-renderer.js';

// Summary-only PDF: totals, movements by type, top-N stock and top-N moved. The full
// kardex ledger (every movement in the period) is Excel-only — see inventory-report-xlsx.ts.
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

export async function renderInventoryReportPdf(r:InventoryReportSnapshot):Promise<Buffer>{
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
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   REPORTE DE INVENTARIO',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text('Reporte de inventario',M+19,58);
 doc.font('Helvetica-Bold').fontSize(9).text(period,W-M-320,38,{width:320,align:'right'});
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre,M+19,95);

 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('EXISTENCIAS (AHORA MISMO)',M,142);
 const boxWidth=(INNER-24)/3;
 const headline:[string,string][]=[
  ['Artículos con stock',String(r.resumen.articulosConStock)],
  ['Valor total de inventario',money(r.resumen.valorTotalInventario,r.currency)],
  ['Movimientos en el período',String(r.kardex.length+(r.kardexTruncado?'+':''))]
 ];
 headline.forEach(([label,value],i)=>card(doc,M+i*(boxWidth+12),162,boxWidth,label,value));

 sectionTitle(doc,'MOVIMIENTOS POR TIPO — '+period,250);
 const tipoWidths=columnWidths(['Tipo','Cantidad','Costo total'],INNER);
 table(doc,['Tipo','Cantidad','Costo total'],
  r.resumen.movimientosPorTipo.map(m=>[m.tipo,m.cantidad,money(m.costoTotal,r.currency)]),
  M,tipoWidths,{startY:272,maxY:H-55});
 doc.font('Helvetica').fontSize(8).fillColor(muted)
  .text('El kardex completo (cada movimiento) está en el Excel.',M,H-58);

 doc.addPage({size:[W,H],margin:0});
 header(doc,r.sucursal.nombre,'EXISTENCIAS Y MOVIMIENTOS',period);
 sectionTitle(doc,'TOP '+Math.min(TOP_N,r.stockActual.length)+' ARTÍCULOS POR VALOR EN STOCK',96);
 const stockWidths=columnWidths(['Artículo','Cantidad','Valor'],INNER);
 table(doc,['Artículo','Cantidad','Valor'],
  r.stockActual.slice(0,TOP_N).map(s=>[s.nombre,s.cantidadActual,money(s.valorActual,r.currency)]),
  M,stockWidths,{startY:118,maxY:300});

 sectionTitle(doc,'TOP '+Math.min(TOP_N,r.topMovidos.length)+' ARTÍCULOS POR VALOR MOVIDO EN EL PERÍODO',330);
 const movWidths=columnWidths(['Artículo','Costo total movido'],INNER);
 table(doc,['Artículo','Costo total movido'],
  r.topMovidos.slice(0,TOP_N).map(a=>[a.nombre,money(a.costoTotalMovido,r.currency)]),
  M,movWidths,{startY:352,maxY:H-55});

 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
