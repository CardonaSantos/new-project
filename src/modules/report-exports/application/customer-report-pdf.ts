import PDFDocument from 'pdfkit';
import type {CustomerReportSnapshot} from './ports/customer-report.port.js';
import {W,H,M,INNER,navy,ink,muted,stripe,white,footer,table,columnWidths,
 type PdfDoc} from './pdf-renderer.js';

// Summary-only PDF: counts + a top-N table. The full roster (all filtered customers,
// every field) is the XLSX's job — see customer-report-xlsx.ts.
const TOP_N=25;

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

export async function renderCustomerReportPdf(r:CustomerReportSnapshot):Promise<Buffer>{
 const doc=new PDFDocument({size:[W,H],margin:0,bufferPages:true,autoFirstPage:false});
 const chunks:Buffer[]=[];
 doc.on('data',(c:Buffer)=>chunks.push(c));
 const done=new Promise<Buffer>((resolve,reject)=>{
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.on('error',reject);
 });

 doc.addPage({size:[W,H],margin:0});
 doc.rect(0,0,W,122).fill(navy);
 doc.rect(M,34,4,55).fill(white);
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   REPORTE DE CLIENTES',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text('Reporte de clientes',M+19,58);
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre,M+19,95);

 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('RESUMEN',M,142);
 const boxWidth=(INNER-36)/4;
 const headline:[string,string][]=[
  ['Total de clientes',String(r.resumen.totalClientes)],
  ['Activos',String(r.resumen.clientesActivos)],
  ['Inactivos',String(r.resumen.clientesInactivos)],
  ['Con compras registradas',String(r.resumen.clientesConCompras)]
 ];
 headline.forEach(([label,value],i)=>card(doc,M+i*(boxWidth+12),162,boxWidth,label,value));

 sectionTitle(doc,'TOP '+Math.min(TOP_N,r.clientes.length)+' CLIENTES POR GASTO',250);
 doc.font('Helvetica').fontSize(9).fillColor(muted)
  .text('El listado completo ('+r.clientes.length+' clientes, todos los campos) está en el Excel.',M,270);
 const widths=columnWidths(['Cliente','Teléfono','Compras','Total gastado','Última compra'],INNER);
 table(doc,['Cliente','Teléfono','Compras','Total gastado','Última compra'],
  r.clientes.slice(0,TOP_N).map(c=>[c.nombre,c.telefono||'—',String(c.cantidadVentas),
   money(c.totalGastado,r.currency),c.ultimaCompra?c.ultimaCompra.slice(0,10).split('-').reverse().join('/'):'—']),
  M,widths,{startY:292,maxY:H-55});

 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
