import type {ExportPayload} from './report-export-formats.js';
import {businessColumns,fieldLabel,formatMoney,isMoney,presentationValue,reportDaily,reportMetrics,reportPeriodLabel,reportTitle} from './professional-export-model.js';

type Page={content:string[]};
const W=842,H=595,M=38,inner=W-2*M;
const navy='#263747',teal='#263747',pale='#F5F7F9',paper='#FFFFFF',
 ink='#182D42',muted='#5B6C79',line='#DCE6EB',stripe='#F4F7F9';
const rgb=(hex:string)=>[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)/255).toFixed(3)).join(' ');
const coord=(y:number)=>H-y;
const safe=(text:string)=>text.normalize('NFC').replace(/[\r\n\t]+/g,' ')
 .replace(/[\u0000-\u001F]/g,'')
 .replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'")
 .replace(/[\u201C\u201D]/g,'"').replace(/[\u2022]/g,'-')
 .replace(/[^\u0020-\u007E\u00A1-\u00FF]/g,'?')
 .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const write=(p:Page,text:string,x:number,y:number,size=10,
 font='F1',color=ink)=>{
 p.content.push(rgb(color)+' rg BT /'+font+' '+size+' Tf 1 0 0 1 '+
  x.toFixed(2)+' '+coord(y).toFixed(2)+' Tm ('+safe(text)+') Tj ET');
};
const rect=(p:Page,x:number,top:number,w:number,h:number,color:string)=>{
 p.content.push(rgb(color)+' rg '+x+' '+coord(top+h)+' '+w+' '+h+' re f');
};
const rule=(p:Page,x:number,top:number,w:number,color=line)=>{
 p.content.push(rgb(color)+' RG 0.6 w '+x+' '+coord(top)+' m '+
  (x+w)+' '+coord(top)+' l S');
};
const estimate=(s:string,font:number)=>s.length*font*0.49;
const shorten=(s:string,space:number,size:number)=>{
 if(estimate(s,size)<=space)return s;
 const chars=Math.max(1,Math.floor(space/(size*0.49))-2);
 return s.slice(0,chars)+'...';
};
function wrap(text:string,max:number,size=9){
 const chars=Math.max(6,Math.floor(max/(size*0.48)));
 const words=text.replace(/[\r\n\t]+/g,' ').split(/\s+/);
 const result:string[]=[];let current='';
 for(const word of words){
  if(!word)continue;
  if(word.length>chars){
   if(current)result.push(current);
   for(let j=0;j<word.length;j+=chars)result.push(word.slice(j,j+chars));
   current='';continue;
  }
  if((current?current.length+1:0)+word.length>chars){
   result.push(current);current=word;
  }else current+=(current?' ':'')+word;
 }
 if(current)result.push(current);
 return result.length?result:[''];
}
const isDay=(r:ExportPayload)=>r.periodo.desde===r.periodo.hasta;
const reportMoney=(key:string,value:string,r:ExportPayload)=>isMoney(key)?formatMoney(value,r.currency,2):value;
const coverHeader=(p:Page,r:ExportPayload)=>{
 rect(p,0,0,W,122,navy);
 rect(p,M,34,4,55,'#FFFFFF');
 write(p,'GASTRO CORE   /   INFORME OPERATIVO',M+19,40,10,'F2','#FFFFFF');
 write(p,reportTitle(r),M+19,72,23,'F2',paper);
 write(p,reportPeriodLabel(r),W-275,40,9,'F2',paper);
 write(p,r.sucursal.nombre+'  |  Moneda '+r.currency,M+19,99,10,'F1',paper);
};
const commonHeader=(p:Page,r:ExportPayload,category:string)=>{
 rect(p,0,0,W,68,navy);
 write(p,'GASTRO CORE  /  '+category,M,29,11,'F2',paper);
 write(p,shorten(reportTitle(r),430,11),M,48,10,'F1','#C7D9E5');
 write(p,shorten(isDay(r)?'DÍA '+r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde+' a '+r.periodo.hasta,300,9),W-335,48,9,'F1',paper);
};
const footer=(p:Page,index:number,length:number)=>{
 rule(p,M,554,inner);
 write(p,'Gastro Core | Reporte para revisión administrativa',M,572,8,'F1',muted);
 write(p,'Gastro Core  -  '+index+' / '+length,W-140,572,8,'F2',muted);
};
const pdfTable=(p:Page,headers:string[],rows:string[][],
 x:number,top:number,widths:number[],font=9,maxY=531)=>{
 let y=top;
 const available=widths.reduce((a,b)=>a+b,0);
 rect(p,x,y-16,available,35,navy);
 let col=x;
 headers.forEach((h,i)=>{
  const parts=wrap(h,widths[i]-16,9).slice(0,2);
  parts.forEach((line,j)=>write(p,line,col+8,y-1+j*12,9,'F2',paper));
  col+=widths[i];
 });
 y+=25;
 for(let i=0;i<rows.length;i++){
  const cells=rows[i].map((v,j)=>wrap(v,widths[j]-16,font));
  const depth=Math.max(1,...cells.map(a=>a.length));
  const height=Math.max(31,10+depth*12);
  if(y+height>maxY)break;
  if(i%2===1)rect(p,x,y-9,available,height,stripe);
  let offset=x;
  cells.forEach((lines,j)=>{
   lines.forEach((text,k)=>write(p,text,offset+8,y+7+k*12,font,'F1',ink));
   offset+=widths[j];
  });
  rule(p,x,y+height-8,available,line);
  y+=height;
 }
 return y;
};
function dailyColumns(rows:Record<string,unknown>[]){
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 return ['fecha',...keys.filter(k=>k!=='fecha')].slice(0,6);
}
function tableWidths(keys:string[],available:number){
 const weights=keys.map(k=>/descripcion|producto|proveedor|nombre|numeroOrden/i.test(k)?1.7:
  /fecha|fecha operativa/i.test(k)?1.35:/cantidad|pagos|estado|cobertura/i.test(k)?1.05:1.15);
 const sum=weights.reduce((a,b)=>a+b,0);return weights.map(w=>available*w/sum);
}
function dailyPages(r:ExportPayload,pages:Page[]){
 const d=reportDaily(r),rows=d.rows as Record<string,unknown>[];
 const keys=dailyColumns(rows);
 const headings=keys.length>1?keys:['fecha','registros'];
 const widths=tableWidths(headings,inner);
 const pageSize=10;
 if(!rows.length)return;
 for(let i=0;i<rows.length;i+=pageSize){
  const p:Page={content:[]};pages.push(p);commonHeader(p,r,'INFORMACIÓN DIARIA');
  write(p,r.periodo.desde===r.periodo.hasta?'Detalle del día':'Evolución diaria',
   M,103,20,'F2');
  write(p,'Cada fila corresponde a una fecha operativa documentada.',M,123,9,'F1',muted);
  pdfTable(p,headings.map(fieldLabel),rows.slice(i,i+pageSize).map(row=>
   headings.map(k=>presentationValue(row[k],k,r.periodo.zonaHoraria,r.currency))),M,160,widths,9,525);
  const note=wrap(d.note,inner,8);
  note.slice(0,2).forEach((l,j)=>write(p,l,M,513+j*11,8,'F1',muted));
 }
}
function detailPages(r:ExportPayload,pages:Page[]){
 const fields=businessColumns(r);
 if(!fields.length)return;
 const widths=tableWidths(fields,inner);
 const rows=r.data.map(row=>fields.map(k=>presentationValue(row[k],k,r.periodo.zonaHoraria,r.currency)));
 let index=0;
 while(index<rows.length){
  const p:Page={content:[]};pages.push(p);commonHeader(p,r,'DETALLE OPERATIVO');
  write(p,'Movimientos y documentos',M,101,19,'F2');
  write(p,'Solo datos necesarios para seguimiento comercial y de caja.',
   M,121,9,'F1',muted);
  let y=152,shown=0;
  rect(p,M,y-15,inner,37,navy);
  let x=M;
  fields.forEach((f,j)=>{
   wrap(fieldLabel(f),widths[j]-12,8).slice(0,2).forEach((l,k)=>
    write(p,l,x+6,y-2+k*12,8,'F2',paper));
   x+=widths[j];
  });
  y+=30;
  while(index<rows.length){
   const cells=rows[index].map((v,j)=>wrap(v,widths[j]-14,8));
   const height=Math.max(30,11+Math.max(...cells.map(c=>c.length))*11);
   if(height>320)throw new RangeError('Detalle PDF demasiado extenso; use XLSX/CSV.');
   if(y+height>531)break;
   if(shown%2===1)rect(p,M,y-10,inner,height,stripe);
   let xx=M;
   cells.forEach((lines,j)=>{
    lines.forEach((t,k)=>write(p,t,xx+6,y+8+k*11,8,'F1'));
    xx+=widths[j];
   });
   rule(p,M,y+height-10,inner);
   y+=height;shown++;index++;
  }
  if(!shown)throw new RangeError('Fila PDF excede el espacio permitido');
 }
}
export function renderProfessionalPdf(r:ExportPayload):Buffer{
 const pages:Page[]=[{content:[]}],p=pages[0];
 coverHeader(p,r);
 write(p,isDay(r)?'RESULTADOS DEL DÍA':'RESUMEN DEL PERÍODO',M,149,12,'F2',navy);
 const metrics=reportMetrics(r).slice(0,6);
 const cards=metrics.slice(0,4);
 const boxWidth=(inner-36)/4;
 for(let i=0;i<cards.length;i++){
  const k=cards[i],x=M+i*(boxWidth+12);
  rect(p,x,168,boxWidth,80,stripe);
  write(p,shorten(k.label,boxWidth-20,9),x+10,190,9,'F1',muted);
  write(p,shorten(reportMoney(k.key,k.value,r),boxWidth-20,16),x+10,223,16,'F2',ink);
 }
 const extras=metrics.slice(4,6);
 if(extras.length){
  write(p,'OTROS DATOS',M,283,10,'F2',navy);
  extras.forEach((k,i)=>{
   const xx=M+i*(inner/2);
   write(p,shorten(k.label,210,10),xx,309,10,'F1',muted);
   write(p,shorten(reportMoney(k.key,k.value,r),116,11),xx+233,309,11,'F2',ink);
  });
 }
 if(isDay(r)){
  write(p,'MOVIMIENTOS DEL DÍA '+r.periodo.desde.split('-').reverse().join('/'),
   M,363,13,'F2',navy);
  rule(p,M,375,inner);
  const daily=reportDaily(r).rows.filter(v=>v.fecha===r.periodo.desde);
  if(daily.length){
   const fields=Object.keys(daily[0]).filter(k=>k!=='fecha').slice(0,4);
   fields.forEach((key,i)=>{
    const xx=M+(i%2)*370,yy=408+Math.floor(i/2)*41;
    write(p,shorten(fieldLabel(key),200,10),xx,yy,10,'F1',muted);
    write(p,shorten(presentationValue(daily[0][key],key,r.periodo.zonaHoraria,r.currency),132,12),
     xx+224,yy,12,'F2',ink);
   });
  }else{
   write(p,'No hay movimientos fechados para este día.',M,405,11,'F1',muted);
  }
  write(p,'Detalle de operaciones en la siguiente sección.',M,525,9,'F1',muted);
 }else{
  write(p,'INFORMACIÓN DIARIA',M,358,12,'F2',navy);
  rule(p,M,369,inner);
  write(p,'El informe incluye una tabla con movimientos agrupados por fecha operativa.',
   M,399,11,'F1',ink);
  write(p,'Detalle de ventas, pagos o consumos en las siguientes páginas.',
   M,426,10,'F1',muted);
 }
 if(!isDay(r))dailyPages(r,pages);
 detailPages(r,pages);
 if(pages.length>500)throw new RangeError('PDF excede 500 páginas');
 pages.forEach((page,i)=>footer(page,i+1,pages.length));
 const objects:string[]=[],add=(x:string)=>{objects.push(x);return objects.length;};
 const cat=add(''),pageRoot=add('');
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const pageIds:number[]=[];
 for(const page of pages){
  const commands=page.content.join('\n')+'\n';
  const n=Buffer.byteLength(commands,'latin1');
  const content=add('<< /Length '+n+' >>\nstream\n'+commands+'endstream');
  pageIds.push(add('<< /Type /Page /Parent '+pageRoot+' 0 R /MediaBox [0 0 '+W+' '+H+
   '] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+
   ' 0 R >> >> /Contents '+content+' 0 R >>'));
 }
 objects[pageRoot-1]='<< /Type /Pages /Kids ['+pageIds.map(n=>n+' 0 R').join(' ')+
  '] /Count '+pageIds.length+' >>';
 objects[cat-1]='<< /Type /Catalog /Pages '+pageRoot+' 0 R >>';
 let pdf='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){
  offsets.push(Buffer.byteLength(pdf,'latin1'));
  pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
 }
 const xref=Buffer.byteLength(pdf,'latin1');
 pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const off of offsets.slice(1))pdf+=String(off).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root '+cat+
  ' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(pdf,'latin1');
}
