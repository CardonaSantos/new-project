import PDFDocument from 'pdfkit';
import type {ExportPayload} from './report-table.js';
import {businessColumns,fieldLabel,formatMoney,isMoney,presentationValue,
 reportDaily,reportMetrics,reportPeriodLabel,reportTitle} from './report-export-model.js';

// Rebuilt on pdfkit (REP-exports refactor, 2026-11): the previous exporter wrote raw PDF
// objects/xref tables by hand. pdfkit owns the PDF object graph now; this file only
// decides content/layout, never the file's binary structure.

// Avoid depending on the ambient PDFKit.* namespace being globally visible (it comes
// from @types/pdfkit and its exposure varies by TS config); derive the instance type
// straight from the imported class instead.
type PdfDoc=InstanceType<typeof PDFDocument>;

const W=842,H=595,M=36,INNER=W-2*M;
const navy='#142638',teal='#263747',pale='#F5F7F9',
 ink='#172B3C',muted='#53677B',line='#DCE6EB',stripe='#F4F7F9',white='#FFFFFF';
const isDay=(r:ExportPayload)=>r.periodo.desde===r.periodo.hasta;
const money=(key:string,value:string,r:ExportPayload)=>isMoney(key)?formatMoney(value,r.currency,2):value;

function header(doc:PdfDoc,title:string,category:string,period:string){
 doc.rect(0,0,W,68).fill(navy);
 doc.fillColor(white).font('Helvetica-Bold').fontSize(11).text('GASTRO CORE  /  '+category,M,22);
 doc.font('Helvetica').fontSize(10).fillColor('#C7D9E5').text(title,M,42,{width:INNER-280});
 doc.font('Helvetica').fontSize(9).fillColor(white).text(period,W-M-260,42,{width:260,align:'right'});
 doc.fillColor(ink);
}
function footer(doc:PdfDoc,index:number,total:number){
 doc.moveTo(M,H-40).lineTo(W-M,H-40).lineWidth(0.6).strokeColor(line).stroke();
 doc.font('Helvetica').fontSize(8).fillColor(muted)
  .text('Gastro Core | Reporte para revisión administrativa',M,H-32)
  .text('Gastro Core  -  '+index+' / '+total,W-M-140,H-32,{width:140,align:'right'});
}
type TableOpts={startY:number;maxY?:number;fontSize?:number};
/** Draws a header band + rows, wrapping text within column widths. Returns the Y after
 * the last row drawn, and how many rows were actually drawn (may be fewer than given,
 * if space ran out — caller is expected to paginate the remainder onto a new page). */
function table(doc:PdfDoc,headers:string[],rows:string[][],
 x:number,widths:number[],opts:TableOpts):{y:number;drawn:number}{
 const size=opts.fontSize??9,maxY=opts.maxY??H-55;
 let y=opts.startY;
 doc.rect(x,y,widths.reduce((a,b)=>a+b,0),22).fill(teal);
 let col=x;
 doc.font('Helvetica-Bold').fontSize(size).fillColor(white);
 headers.forEach((h,i)=>{doc.text(h,col+6,y+6,{width:widths[i]-10});col+=widths[i];});
 y+=22;
 doc.font('Helvetica').fontSize(size).fillColor(ink);
 let drawn=0;
 for(const row of rows){
  const heights=row.map((cell,i)=>doc.heightOfString(cell,{width:widths[i]-10}));
  const rowHeight=Math.max(20,Math.max(...heights)+8);
  if(y+rowHeight>maxY)break;
  if(drawn%2===1){doc.rect(x,y,widths.reduce((a,b)=>a+b,0),rowHeight).fill(stripe);doc.fillColor(ink);}
  let cx=x;
  row.forEach((cell,i)=>{doc.text(cell,cx+6,y+5,{width:widths[i]-10});cx+=widths[i];});
  doc.moveTo(x,y+rowHeight).lineTo(x+widths.reduce((a,b)=>a+b,0),y+rowHeight)
   .lineWidth(0.5).strokeColor(line).stroke();
  y+=rowHeight;drawn++;
 }
 return {y,drawn};
}
function columnWidths(keys:string[],available:number):number[]{
 const weights=keys.map(k=>/descripcion|producto|proveedor|nombre|numeroOrden/i.test(k)?1.7:
  /fecha|fecha operativa/i.test(k)?1.35:/cantidad|pagos|estado|cobertura/i.test(k)?1.05:1.15);
 const sum=weights.reduce((a,b)=>a+b,0);
 return weights.map(w=>available*w/sum);
}
function dailyColumns(rows:Record<string,unknown>[]):string[]{
 const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 return ['fecha',...keys.filter(k=>k!=='fecha')].slice(0,6);
}
function periodLabel(r:ExportPayload){
 return isDay(r)?'DÍA '+r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde+' a '+r.periodo.hasta;
}
function addDailyPages(doc:PdfDoc,r:ExportPayload,pageCount:{n:number}){
 const d=reportDaily(r),rows=d.rows as Record<string,unknown>[];
 if(!rows.length)return;
 const keys=dailyColumns(rows);
 const headings=keys.length>1?keys:['fecha','registros'];
 const widths=columnWidths(headings,INNER);
 const pageSize=14;
 for(let i=0;i<rows.length;i+=pageSize){
  doc.addPage({size:[W,H],margin:0});pageCount.n++;
  header(doc,reportTitle(r),'INFORMACIÓN DIARIA',periodLabel(r));
  doc.font('Helvetica-Bold').fontSize(14).fillColor(navy)
   .text(isDay(r)?'Detalle del día':'Evolución diaria',M,88);
  doc.font('Helvetica').fontSize(9).fillColor(muted)
   .text('Cada fila corresponde a una fecha operativa documentada.',M,108);
  const chunk=rows.slice(i,i+pageSize).map(row=>
   headings.map(k=>presentationValue(row[k],k,r.periodo.zonaHoraria,r.currency)));
  table(doc,headings.map(fieldLabel),chunk,M,widths,{startY:130,maxY:H-70});
  doc.font('Helvetica').fontSize(8).fillColor(muted).text(d.note,M,H-58,{width:INNER});
 }
}
function addDetailPages(doc:PdfDoc,r:ExportPayload,pageCount:{n:number}){
 const fields=businessColumns(r);
 if(!fields.length)return;
 const widths=columnWidths(fields,INNER);
 const rows=r.data.map(row=>fields.map(k=>presentationValue(row[k],k,r.periodo.zonaHoraria,r.currency)));
 let index=0;
 while(index<rows.length){
  doc.addPage({size:[W,H],margin:0});pageCount.n++;
  header(doc,reportTitle(r),'DETALLE OPERATIVO',periodLabel(r));
  doc.font('Helvetica-Bold').fontSize(14).fillColor(navy).text('Movimientos y documentos',M,88);
  doc.font('Helvetica').fontSize(9).fillColor(muted)
   .text('Solo datos necesarios para seguimiento comercial y de caja.',M,108);
  const remaining=rows.slice(index);
  const {drawn}=table(doc,fields.map(fieldLabel),remaining,M,widths,{startY:130,maxY:H-50,fontSize:8});
  if(drawn===0){
   // A single row's wrapped height exceeds the usable page area even on a fresh page —
   // mirrors the old renderer's guard: ask the caller to fall back to XLSX/CSV rather
   // than loop forever or silently drop data.
   throw new RangeError('Fila PDF excede el espacio permitido; use XLSX/CSV.');
  }
  index+=drawn;
  if(pageCount.n>500)throw new RangeError('PDF excede 500 páginas');
 }
}
export async function renderPdfReport(r:ExportPayload):Promise<Buffer>{
 const doc=new PDFDocument({size:[W,H],margin:0,bufferPages:true,autoFirstPage:false});
 const chunks:Buffer[]=[];
 doc.on('data',(c:Buffer)=>chunks.push(c));
 const done=new Promise<Buffer>((resolve,reject)=>{
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.on('error',reject);
 });
 const pageCount={n:0};
 // Cover page
 doc.addPage({size:[W,H],margin:0});pageCount.n++;
 doc.rect(0,0,W,122).fill(navy);
 doc.rect(M,34,4,55).fill(white);
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   INFORME OPERATIVO',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text(reportTitle(r),M+19,58);
 doc.font('Helvetica-Bold').fontSize(9).text(reportPeriodLabel(r),W-M-260,38,{width:260,align:'right'});
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre+'  |  Moneda '+r.currency,M+19,95);
 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12)
  .text(isDay(r)?'RESULTADOS DEL DÍA':'RESUMEN DEL PERÍODO',M,142);
 const metrics=reportMetrics(r).slice(0,6),cards=metrics.slice(0,4);
 const boxWidth=(INNER-36)/4;
 cards.forEach((k,i)=>{
  const x=M+i*(boxWidth+12);
  doc.rect(x,160,boxWidth,72).fill(stripe);
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(k.label,x+10,174,{width:boxWidth-20});
  doc.font('Helvetica-Bold').fontSize(14).fillColor(ink).text(money(k.key,k.value,r),x+10,194,{width:boxWidth-20});
 });
 const extras=metrics.slice(4,6);
 if(extras.length){
  doc.font('Helvetica-Bold').fontSize(10).fillColor(navy).text('OTROS DATOS',M,248);
  extras.forEach((k,i)=>{
   const xx=M+i*(INNER/2);
   doc.font('Helvetica').fontSize(10).fillColor(muted).text(k.label,xx,270,{width:200});
   doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(money(k.key,k.value,r),xx+210,270,{width:140});
  });
 }
 if(isDay(r)){
  doc.font('Helvetica-Bold').fontSize(13).fillColor(navy)
   .text('MOVIMIENTOS DEL DÍA '+r.periodo.desde.split('-').reverse().join('/'),M,320);
  doc.moveTo(M,338).lineTo(W-M,338).strokeColor(line).lineWidth(0.6).stroke();
  const daily=reportDaily(r).rows.filter(v=>v.fecha===r.periodo.desde);
  if(daily.length){
   const fields=Object.keys(daily[0]).filter(k=>k!=='fecha').slice(0,4);
   fields.forEach((key,i)=>{
    const xx=M+(i%2)*370,yy=358+Math.floor(i/2)*38;
    doc.font('Helvetica').fontSize(10).fillColor(muted).text(fieldLabel(key),xx,yy,{width:200});
    doc.font('Helvetica-Bold').fontSize(12).fillColor(ink)
     .text(presentationValue(daily[0][key],key,r.periodo.zonaHoraria,r.currency),xx+200,yy,{width:150});
   });
  }else{
   doc.font('Helvetica').fontSize(11).fillColor(muted).text('No hay movimientos fechados para este día.',M,358);
  }
  doc.font('Helvetica').fontSize(9).fillColor(muted).text('Detalle de operaciones en la siguiente sección.',M,H-60);
 }else{
  doc.font('Helvetica-Bold').fontSize(12).fillColor(navy).text('INFORMACIÓN DIARIA',M,315);
  doc.moveTo(M,330).lineTo(W-M,330).strokeColor(line).lineWidth(0.6).stroke();
  doc.font('Helvetica').fontSize(11).fillColor(ink)
   .text('El informe incluye una tabla con movimientos agrupados por fecha operativa.',M,345);
  doc.font('Helvetica').fontSize(10).fillColor(muted)
   .text('Detalle de ventas, pagos o consumos en las siguientes páginas.',M,365);
 }
 if(!isDay(r))addDailyPages(doc,r,pageCount);
 addDetailPages(doc,r,pageCount);
 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
