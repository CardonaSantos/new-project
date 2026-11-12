import PDFDocument from 'pdfkit';
import type {CashSessionReportSnapshot} from './ports/cash-session-report.port.js';
import {W,H,M,INNER,navy,ink,muted,stripe,white,footer,table,columnWidths,
 type PdfDoc} from './pdf-renderer.js';

// Summary-only PDF: totals + the sessions that actually have a cash discrepancy (the
// thing an admin reviewing this report cares about most). The full session-by-session
// ledger (every turno, every payment-method breakdown) is Excel-only.
const TOP_N=30;

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

export async function renderCashSessionReportPdf(r:CashSessionReportSnapshot):Promise<Buffer>{
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
 doc.fillColor(white).font('Helvetica-Bold').fontSize(10).text('GASTRO CORE   /   CIERRES DE CAJA',M+19,38);
 doc.font('Helvetica-Bold').fontSize(23).text('Cierres de caja',M+19,58);
 doc.font('Helvetica-Bold').fontSize(9).text(period,W-M-320,38,{width:320,align:'right'});
 doc.font('Helvetica').fontSize(10).text(r.sucursal.nombre,M+19,95);

 doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('RESUMEN',M,142);
 const boxWidth=(INNER-36)/4;
 const headline:[string,string][]=[
  ['Total de turnos',String(r.resumen.totalTurnos)],
  ['Turnos con diferencia',String(r.resumen.turnosConDiferencia)],
  ['Efectivo esperado (suma)',money(r.resumen.efectivoEsperado,r.currency)],
  ['Diferencia (suma)',money(r.resumen.diferencia,r.currency)]
 ];
 headline.forEach(([label,value],i)=>card(doc,M+i*(boxWidth+12),162,boxWidth,label,value));
 doc.font('Helvetica').fontSize(10).fillColor(muted)
  .text('Abiertos: '+r.resumen.abiertos+'   Cerrados: '+r.resumen.cerrados,M,250);

 const conDiferencia=r.turnos.filter(t=>t.fuenteArqueo!=='SIN_DATOS'&&Number(t.diferencia)!==0);
 sectionTitle(doc,'TURNOS CON DIFERENCIA DE CAJA ('+conDiferencia.length+')',280);
 doc.font('Helvetica').fontSize(9).fillColor(muted)
  .text('El detalle de todos los turnos (con o sin diferencia) está en el Excel.',M,298);
 const widths=columnWidths(['Caja','Cajero','Fecha','Esperado','Contado','Diferencia'],INNER);
 table(doc,['Caja','Cajero','Fecha','Esperado','Contado','Diferencia'],
  conDiferencia.slice(0,TOP_N).map(t=>[t.caja,t.cajero,t.fechaOperativa.split('-').reverse().join('/'),
   money(t.efectivoEsperado,r.currency),money(t.efectivoContado,r.currency),
   money(t.diferencia,r.currency)]),
  M,widths,{startY:320,maxY:H-55});

 if(!conDiferencia.length){
  doc.font('Helvetica').fontSize(11).fillColor(muted)
   .text('Ningún turno con arqueo registrado presentó diferencia en este período.',M,330);
 }

 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);
  footer(doc,i-range.start+1,range.count);
 }
 doc.end();
 return done;
}
