import type {ExportPayload} from './report-export-formats.js';
import {businessColumns,fieldLabel,presentationValue,reportDaily,reportMetrics,reportTitle} from './professional-export-model.js';

type Page={content:string[]};
const W=842,H=595,M=38,inner=W-2*M;
const navy='#152A3D',teal='#087B77',pale='#EAF4F3',paper='#FFFFFF',
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
const coverHeader=(p:Page,r:ExportPayload)=>{
 rect(p,0,0,W,122,navy);
 rect(p,M,34,5,53,teal);
 write(p,'GASTRO CORE   /   ANALÍTICA OPERATIVA',M+19,40,10,'F2','#98D9D3');
 write(p,reportTitle(r),M+19,72,23,'F2',paper);
 write(p,r.periodo.desde===r.periodo.hasta?'REPORTE DIARIO':'REPORTE DE PERÍODO',
  W-194,40,9,'F2',paper);
 write(p,r.sucursal.nombre+'  |  '+r.periodo.desde+' al '+r.periodo.hasta+
  '  |  '+r.currency,M+19,99,10,'F1',paper);
};
const commonHeader=(p:Page,r:ExportPayload,category:string)=>{
 rect(p,0,0,W,68,navy);
 write(p,'GASTRO CORE  /  '+category,M,29,11,'F2',paper);
 write(p,shorten(reportTitle(r),430,11),M,48,10,'F1','#C7D9E5');
 write(p,shorten(r.sucursal.nombre+'  |  '+r.periodo.desde+' - '+r.periodo.hasta,
  330,9),W-362,48,9,'F1',paper);
};
const footer=(p:Page,index:number,length:number)=>{
 rule(p,M,554,inner);
 write(p,'Documento operativo  |  '+ 'Datos técnicos completos en XLSX / CSV',M,572,8,'F1',muted);
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
 if(!rows.length){
  const p:Page={content:[]};pages.push(p);commonHeader(p,r,'INFORMACIÓN DIARIA');
  write(p,'Resumen diario',M,105,19,'F2');
  rect(p,M,125,inner,80,pale);
  write(p,r.periodo.desde===r.periodo.hasta?
   'Sin movimientos fechados en esta fuente para el día.':'Sin desglose por día verificable para este origen.',M+18,153,12,'F2');
  wrap(d.note,inner-36,10).slice(0,3).forEach((a,i)=>write(p,a,M+18,177+i*14,10,'F1',muted));
  return;
 }
 for(let i=0;i<rows.length;i+=pageSize){
  const p:Page={content:[]};pages.push(p);commonHeader(p,r,'INFORMACIÓN DIARIA');
  write(p,r.periodo.desde===r.periodo.hasta?'Detalle del día':'Evolución diaria',
   M,103,20,'F2');
  write(p,'Cada fila corresponde a una fecha operativa documentada.',M,123,9,'F1',muted);
  pdfTable(p,headings.map(fieldLabel),rows.slice(i,i+pageSize).map(row=>
   headings.map(k=>presentationValue(row[k],k,r.periodo.zonaHoraria))),M,160,widths,9,525);
  const note=wrap(d.note,inner,8);
  note.slice(0,2).forEach((l,j)=>write(p,l,M,513+j*11,8,'F1',muted));
 }
}
function detailPages(r:ExportPayload,pages:Page[]){
 const fields=businessColumns(r);
 if(!fields.length)return;
 const widths=tableWidths(fields,inner);
 const rows=r.data.map(row=>fields.map(k=>presentationValue(row[k],k,r.periodo.zonaHoraria)));
 let index=0;
 while(index<rows.length){
  const p:Page={content:[]};pages.push(p);commonHeader(p,r,'DETALLE OPERATIVO');
  write(p,'Movimientos y documentos',M,101,19,'F2');
  write(p,'Se muestran los campos de negocio prioritarios. IDs íntegros en XLSX/CSV.',
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
 write(p,'INDICADORES DEL PERÍODO',M,152,10,'F2',teal);
 const metrics=reportMetrics(r).slice(0,8);
 const cards=metrics.slice(0,4);
 const boxWidth=(inner-33)/4;
 for(let i=0;i<4;i++){
  const k=cards[i],x=M+i*(boxWidth+11);
  rect(p,x,167,boxWidth,84,i===0?pale:stripe);
  write(p,shorten(k?.label??'',boxWidth-18,9),x+11,189,9,'F1',muted);
  write(p,shorten(k?.value??'',boxWidth-18,16),x+11,222,16,'F2',ink);
 }
 write(p,'PANORAMA',M,289,12,'F2',teal);
 rect(p,M,304,inner,102,stripe);
 const summary=metrics.slice(4,8);
 if(summary.length){
  summary.forEach((k,i)=>{
   const x=M+18+(i%2)*375,y=332+Math.floor(i/2)*34;
   write(p,k.label,x,y,10,'F1',muted);
   write(p,k.value,x+245,y,11,'F2',ink);
  });
 }else{
  write(p,'Registros exportados: '+r.meta.total,M+18,338,11,'F2',ink);
 }
 write(p,'CONTENIDO DEL INFORME',M,446,12,'F2',teal);
 write(p,'1. Información diaria por fecha operativa verificada',M,473,11);
 write(p,'2. Detalle operativo con los principales campos de negocio',M,494,11);
 write(p,'3. Trazabilidad y todos los identificadores: CSV / XLSX',M,515,10,'F1',muted);
 dailyPages(r,pages);
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
