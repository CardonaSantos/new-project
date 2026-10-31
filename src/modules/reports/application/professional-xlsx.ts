import {deflateRawSync} from 'node:zlib';
import type {ExportPayload} from './report-export-formats.js';
import {fieldLabel,isMoney,presentationValue,reportDaily,reportMetrics,reportPeriodLabel,reportTitle,sourceKeys,str} from './professional-export-model.js';
type Cell={v:string;kind?:'text'|'number'|'formula';style?:number};
type Line={cells:Cell[];height?:number};
type Worksheet={name:string;lines:Line[];widths:number[];merges?:string[];filter?:string;freeze?:number};
const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
 .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'');
const xmlHead='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const tag=(v:string,style=0,kind:Cell['kind']='text'):Cell=>({v,style,kind});
const alpha=(n:number)=>{let result='';for(let x=n+1;x>0;x=Math.floor((x-1)/26))
 result=String.fromCharCode(65+(x-1)%26)+result;return result;};
const decimal=/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const id=(k:string)=>/id$/i.test(k)||/documentosConsumo/.test(k);
const fractional=(v:string)=>v.includes('.')?v.split('.')[1].length:0;
function numericCell(value:unknown,key:string,rowBand=false,currency='GTQ'):Cell{
 if(value==null)return tag('',rowBand?6:5);
 const v=str(value);
 if((typeof value==='number'||decimal.test(v))&&!id(key)&&v.length<=18&&decimal.test(v)){
  const dp=fractional(v),money=isMoney(key);
  if(money&&currency==='GTQ')return tag(v,dp>2?(rowBand?11:10):(rowBand?9:8),'number');
  if(money&&currency==='USD')return tag(v,dp>2?(rowBand?25:24):(rowBand?23:22),'number');
  return tag(v,dp>2?(rowBand?19:18):dp>0?(rowBand?21:20):(rowBand?13:12),'number');
 }
 return tag(presentationValue(value,key),rowBand?6:5);
}
function row(cells:Cell[],height=23):Line{return {cells,height};}
const colors={navy:'FF142638',navy2:'FF223C54',teal:'FF34475A',
 pale:'FFF4F6F8',line:'FFE2E7EC',gray:'FFF7F8F9',white:'FFFFFFFF',
 muted:'FF53677B',ink:'FF172B3C',gold:'FFB77938'};
const font=(size:number,bold=false,color=colors.ink)=>'<font>'+
 (bold?'<b/>':'')+'<sz val="'+size+'"/><color rgb="'+color+
 '"/><name val="Aptos"/></font>';
const fill=(color:string)=>'<fill><patternFill patternType="solid">'+
 '<fgColor rgb="'+color+'"/><bgColor indexed="64"/></patternFill></fill>';
const border='<border><left style="hair"><color rgb="'+colors.line+
 '"/></left><right style="hair"><color rgb="'+colors.line+
 '"/></right><top style="hair"><color rgb="'+colors.line+
 '"/></top><bottom style="hair"><color rgb="'+colors.line+
 '"/></bottom><diagonal/></border>';
// OpenXML ordering is essential: numFmts, fonts, fills, borders,
// cellStyleXfs, cellXfs, cellStyles, tableStyles.
// The prior exporter emitted numFmts after cellStyleXfs, which Excel repaired.
const styles=xmlHead+
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<numFmts count="7"><numFmt numFmtId="164" formatCode="&quot;Q&quot; #,##0.00"/>'+
 '<numFmt numFmtId="165" formatCode="&quot;Q&quot; #,##0.000000"/>'+
 '<numFmt numFmtId="166" formatCode="#,##0"/>'+
 '<numFmt numFmtId="167" formatCode="#,##0.000000"/>'+
 '<numFmt numFmtId="168" formatCode="#,##0.00"/>'+
 '<numFmt numFmtId="169" formatCode="&quot;USD&quot; #,##0.00"/>'+
 '<numFmt numFmtId="170" formatCode="&quot;USD&quot; #,##0.000000"/></numFmts>'+
 '<fonts count="6">'+font(11)+font(19,true,colors.white)+font(11,true,colors.white)+
 font(11,true,colors.navy)+font(11,true,colors.teal)+font(10,false,colors.muted)+'</fonts>'+
 '<fills count="7"><fill><patternFill patternType="none"/></fill>'+
 '<fill><patternFill patternType="gray125"/></fill>'+
 [colors.white,colors.navy,colors.teal,colors.gray,colors.pale].map(fill).join('')+
 '</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'+
 border+'</borders>'+
 '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
 '<cellXfs count="26">'+[
  [0,0,2,0,'left',false],  // 0
  [0,1,3,0,'left',false],  // 1 title
  [0,2,4,0,'left',false],  // 2 section
  [0,3,2,0,'left',false],  // 3 label bold
  [0,4,6,0,'left',false],  // 4 accent
  [0,0,2,1,'left',true],   // 5 body
  [0,0,5,1,'left',true],   // 6 band
  [0,2,3,1,'left',true],   // 7 table head
  [164,0,2,1,'right',false], // 8 cents
  [164,0,5,1,'right',false], // 9 cents shaded
  [165,0,2,1,'right',false], // 10 micros
  [165,0,5,1,'right',false], // 11 micros shaded
  [166,0,2,1,'right',false], // 12 ints
  [166,0,5,1,'right',false], // 13 ints shaded
  [0,5,6,1,'left',true],   // 14 technical id
  [0,4,4,0,'left',true],   // 15 highlight
  [164,3,6,1,'right',false], // 16 total
  [165,3,6,1,'right',false], // 17 total Q micro
  [167,0,2,1,'right',false], // 18 decimal nonmonetary
  [167,0,5,1,'right',false], // 19 alternate
  [168,0,2,1,'right',false], // 20 decimal nonmonetary
  [168,0,5,1,'right',false], // 21 alternate
  [169,0,2,1,'right',false], // 22 USD
  [169,0,5,1,'right',false], // 23 alternate USD
  [170,0,2,1,'right',false], // 24 USD 6 decimals
  [170,0,5,1,'right',false]  // 25 alternate USD
 ].map(([num,f,fi,b,align,wrap])=>'<xf numFmtId="'+num+'" fontId="'+f+
  '" fillId="'+fi+'" borderId="'+b+'" xfId="0" applyAlignment="1" applyNumberFormat="1">'+
  '<alignment horizontal="'+align+'" vertical="center" wrapText="'+(wrap?'1':'0')+'"/>'+
  '</xf>').join('')+'</cellXfs>'+
 '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
 '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'+
 '</styleSheet>';
const cellXml=(v:Cell,ref:string)=>{
 const style=' s="'+(v.style??0)+'"';
 if(v.kind==='formula')return '<c r="'+ref+'"'+style+'><f>'+escapeXml(v.v)+'</f></c>';
 if(v.kind==='number'&&decimal.test(v.v))return '<c r="'+ref+'"'+style+'><v>'+v.v+'</v></c>';
 return '<c r="'+ref+'"'+style+' t="inlineStr"><is><t xml:space="preserve">'+
  escapeXml(v.v)+'</t></is></c>';
};
function sheetXml(ws:Worksheet){
 const endCol=alpha(Math.max(0,ws.widths.length-1));
 const sheets=ws.lines.map((line,i)=>'<row r="'+(i+1)+'" ht="'+(line.height??22)+
  '" customHeight="1">'+line.cells.map((c,j)=>cellXml(c,alpha(j)+(i+1))).join('')+
  '</row>').join('');
 const widths=ws.widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+
  '" width="'+w+'" customWidth="1"/>').join('');
 const freeze=ws.freeze?'<pane ySplit="'+ws.freeze+'" topLeftCell="A'+(ws.freeze+1)+
  '" activePane="bottomLeft" state="frozen"/>':'';
 const merges=ws.merges?.length?'<mergeCells count="'+ws.merges.length+'">'+
  ws.merges.map(m=>'<mergeCell ref="'+m+'"/>').join('')+'</mergeCells>':'';
 return xmlHead+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<dimension ref="A1:'+endCol+ws.lines.length+'"/>'+
  '<sheetViews><sheetView showGridLines="0" workbookViewId="0">'+freeze+
  '</sheetView></sheetViews>'+
  '<sheetFormatPr defaultRowHeight="22"/><cols>'+widths+'</cols>'+
  '<sheetData>'+sheets+'</sheetData>'+
  (ws.filter?'<autoFilter ref="'+ws.filter+'"/>':'')+merges+
  '<pageMargins left="0.4" right="0.4" top="0.65" bottom="0.5" header="0.25" footer="0.25"/>'+
  '</worksheet>';
}
function crc32(buffer:Buffer){
 let result=0xffffffff;
 for(const ch of buffer){result^=ch;for(let j=0;j<8;j++)
  result=(result>>>1)^((result&1)?0xedb88320:0);}
 return (result^0xffffffff)>>>0;
}
function zip(files:{name:string;content:string}[]){
 const blocks:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const f of files){
  const name=Buffer.from(f.name),input=Buffer.from(f.content,'utf8');
  const packed=deflateRawSync(input),crc=crc32(input);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);
  local.writeUInt32LE(input.length,22);local.writeUInt16LE(name.length,26);
  blocks.push(local,name,packed);
  const cent=Buffer.alloc(46);cent.writeUInt32LE(0x02014b50,0);
  cent.writeUInt16LE(20,4);cent.writeUInt16LE(20,6);cent.writeUInt16LE(8,10);
  cent.writeUInt32LE(crc,16);cent.writeUInt32LE(packed.length,20);
  cent.writeUInt32LE(input.length,24);cent.writeUInt16LE(name.length,28);
  cent.writeUInt32LE(offset,42);central.push(cent,name);
  offset+=local.length+name.length+packed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);
 end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);
 end.writeUInt32LE(offset,16);
 return Buffer.concat([...blocks,directory,end]);
}
function summarySheet(r:ExportPayload):Worksheet{
 const metrics=reportMetrics(r).slice(0,8),lines:Line[]=[],merges:string[]=[];
 const full=(value:string,style=0,height=30)=>{
  lines.push(row([tag(value,style),tag(''),tag(''),tag('')],height));
  merges.push('A'+lines.length+':D'+lines.length);
 };
 full('GASTRO CORE  /  INFORMES',1,43);
 full(reportTitle(r),3,39);
 full(reportPeriodLabel(r),3,31);
 full('Sucursal: '+r.sucursal.nombre+'  |  Moneda: '+r.currency,5,29);
 full('RESULTADOS PRINCIPALES',2,31);
 for(let i=0;i<metrics.length;i+=2){
  const m=metrics[i],n=metrics[i+1];
  lines.push(row([tag(m.label,3),numericCell(m.value,m.key,false,r.currency),
   tag(n?.label??'',3),n?numericCell(n.value,n.key,false,r.currency):tag('')],34));
 }
 full('MOVIMIENTOS Y DETALLE',2,30);
 full('La hoja Diario agrupa los registros por fecha. La hoja Detalle muestra los documentos.',5,34);
 full('Importes según registros originales. Las diferencias de cobro y venta requieren conciliación.',5,31);
 return {name:'Resumen',lines,widths:[36,25,36,25],merges,freeze:3};
}
function dailySheet(r:ExportPayload):Worksheet{
 const d=reportDaily(r);const keys=[...new Set(d.rows.flatMap(x=>Object.keys(x)))];
 const fields=['fecha',...keys.filter(k=>k!=='fecha')];
 const columns=fields.length>1?fields:['fecha','registros'];
 const title=r.periodo.desde===r.periodo.hasta?'REPORTE DEL DÍA: '+r.periodo.desde.split('-').reverse().join('/'):'MOVIMIENTOS DIARIOS DEL PERÍODO';
 const lines:Line[]=[row([tag(title,1)],43),
  row([tag(r.periodo.desde+' al '+r.periodo.hasta+'  |  '+r.sucursal.nombre,3)],31),
  row([tag('Movimientos agrupados por fecha operativa. El detalle conserva sus importes.',5)],31),
  row(columns.map(k=>tag(fieldLabel(k),7)),36)];
 for(let i=0;i<d.rows.length;i++){
  const item=d.rows[i];lines.push(row(columns.map(k=>numericCell(item[k],k,i%2===1,r.currency)),27));
 }
 if(!d.rows.length)
  lines.push(row([tag('No hay movimientos con fecha operativa verificable en esta fuente y período.',15)],36));
 return {name:'Diario',lines,widths:columns.map(k=>k==='fecha'?19:Math.max(18,Math.min(33,fieldLabel(k).length+8))),
  merges:['A1:'+alpha(columns.length-1)+'1','A2:'+alpha(columns.length-1)+'2',
   'A3:'+alpha(columns.length-1)+'3'],filter:d.rows.length?'A4:'+alpha(columns.length-1)+(4+d.rows.length):undefined,freeze:4};
}
function detailSheet(r:ExportPayload):Worksheet{
 const keys=sourceKeys(r),last=keys.length;
 const lines:Line[]=[
  row([tag('DETALLE  |  '+reportTitle(r),1)],43),
  row([tag('Sucursal '+r.sucursal.nombre+'  •  '+r.periodo.desde+' / '+r.periodo.hasta,3)],30),
  row([tag('Detalle de operaciones. Montos editables y sumables.',5)],29),
  row(keys.map(k=>tag(fieldLabel(k),7)),37)
 ];
 for(let i=0;i<r.data.length;i++)
  lines.push(row(keys.map(k=>numericCell(r.data[i][k],k,i%2===1,r.currency)),
   keys.some(k=>/descripcion|documentosConsumo/i.test(k))?34:27));
 const endRow=lines.length;
 if(r.data.length){
  const totals=keys.map((k,i)=>{
   const numeric=r.data.every(item=>item[k]==null||decimal.test(str(item[k])))&&
    r.data.some(item=>item[k]!=null)&&
    !id(k)&&!/fecha|estado|codigo|numero/i.test(k);
   if(numeric){
    const c=alpha(i);return tag('SUM('+c+'5:'+c+endRow+')',
     isMoney(k)?(r.currency==='GTQ'?(r.data.some(x=>fractional(str(x[k]))>2)?17:16):22):12,'formula');
   }
   return tag(i===0?'TOTAL (VERIFICACIÓN)':'',3);
  });
  lines.push(row(totals,34));
 }
 const widths=keys.map(k=>{
  if(id(k))return 31;
  if(/descripcion|detalle|observacion|motivo|documentosConsumo/i.test(k))return 39;
  if(/producto|proveedor|cliente/i.test(k))return 30;
  if(/fecha|creadaEn|cerradaEn|canceladaEn/i.test(k))return 24;
  if(/numeroOrden|numeroDocumento/i.test(k))return 24;
  return Math.max(15,Math.min(28,fieldLabel(k).length+7));
 });
 return {name:'Detalle',lines,widths,
  merges:['A1:'+alpha(last-1)+'1','A2:'+alpha(last-1)+'2',
   'A3:'+alpha(last-1)+'3'],
  filter:r.data.length?'A4:'+alpha(last-1)+(4+r.data.length):undefined,freeze:4};
}
export function renderProfessionalXlsx(r:ExportPayload):Buffer{
 const sheets=[summarySheet(r),dailySheet(r),detailSheet(r)];
 const contentTypes=xmlHead+
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
  '<Default Extension="xml" ContentType="application/xml"/>'+
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
  sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+
   '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+
  '</Types>';
 const rootRels=xmlHead+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const workbook=xmlHead+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'+
  ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<sheets>'+sheets.map((s,i)=>'<sheet name="'+escapeXml(s.name)+'" sheetId="'+
   (i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets>'+
  '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
 const wbRels=xmlHead+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
  '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 return zip([{name:'[Content_Types].xml',content:contentTypes},
  {name:'_rels/.rels',content:rootRels},
  {name:'xl/workbook.xml',content:workbook},
  {name:'xl/_rels/workbook.xml.rels',content:wbRels},
  {name:'xl/styles.xml',content:styles},
  ...sheets.map((s,i)=>({name:'xl/worksheets/sheet'+(i+1)+'.xml',content:sheetXml(s)}))]);
}
