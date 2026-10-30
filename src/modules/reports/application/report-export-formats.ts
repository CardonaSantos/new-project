import {deflateRawSync} from 'node:zlib';

export type ExportFormat='CSV'|'XLSX'|'PDF';
export type ExportPayload={
 source:string;currency:string;periodo:{desde:string;hasta:string};
 sucursal:{id:string;nombre:string};data:Record<string,unknown>[];
 meta:{total:number};totales?:unknown;exportacion?:unknown;
};
const cellText=(v:unknown):string=>{
 if(v===null||v===undefined)return '';
 if(v instanceof Date)return v.toISOString();
 if(typeof v==='object')return JSON.stringify(v);
 return String(v);
};
export const exportTable=(r:ExportPayload)=>{
 const headers=[...new Set(r.data.flatMap(x=>Object.keys(x)))];
 if(!headers.length)headers.push('sinRegistros');
 const rows=r.data.map(x=>headers.map(h=>cellText(x[h])));
 return {headers,rows};
};
const csvValue=(s:string)=>{
 // No spreadsheet commands may be injected through text sourced from products,
 // customer records, filenames, references or narrative fields.
 const unsafe=/^[=+\-@\t\r\n]/.test(s)&&!/^-\d+(?:\.\d+)?$/.test(s);
 const v=unsafe?"'"+s:s;
 return '"'+v.replace(/"/g,'""')+'"';
};
export function renderCsv(r:ExportPayload):Buffer{
 const {headers,rows}=exportTable(r);
 const records=[headers.map(csvValue).join(','),...rows.map(row=>row.map(csvValue).join(','))];
 return Buffer.from('\uFEFF'+records.join('\r\n')+'\r\n','utf8');
}
const xml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
 .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const column=(index:number)=>{
 let i=index,result='';
 do{result=String.fromCharCode(65+i%26)+result;i=Math.floor(i/26)-1;}while(i>=0);
 return result;
};
const numeric=(s:string)=>/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(s);
const excelCell=(text:string,ref:string,style=0)=>{
 if(numeric(text))return '<c r="'+ref+'" s="'+(text.includes('.')?(text.split('.')[1].length>2?4:2):1)+'"><v>'+text+'</v></c>';
 return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t>'+xml(text)+'</t></is></c>';
};
const sheet=(rows:string[][],formulas:Map<string,string>,frozen=1)=>{
 let body='';
 for(let i=0;i<rows.length;i++){
  const cells=rows[i].map((value,j)=>{
   const address=column(j)+(i+1);
   const f=formulas.get(address);
   return f?'<c r="'+address+'" s="2"><f>'+xml(f)+'</f></c>':
    excelCell(value,address,i===0?3:0);
  }).join('');
  body+='<row r="'+(i+1)+'">'+cells+'</row>';
 }
 const maxCol=column(Math.max(0,...rows.map(r=>r.length-1)));
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<dimension ref="A1:'+maxCol+Math.max(1,rows.length)+'"/>'+
 '<sheetViews><sheetView workbookViewId="0"><pane ySplit="'+frozen+'" topLeftCell="A'+(frozen+1)+
 '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
 '<sheetFormatPr defaultRowHeight="18"/><sheetData>'+body+'</sheetData>'+
 '<autoFilter ref="A1:'+maxCol+Math.max(1,rows.length)+'"/></worksheet>';
};
const checksum=(data:Buffer)=>{
 let crc=0xffffffff;
 for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
};
function zip(entries:{name:string;body:string}[]):Buffer{
 const chunks:Buffer[]=[],central:Buffer[]=[];
 let offset=0;
 for(const {name,body} of entries){
  const filename=Buffer.from(name,'utf8'),original=Buffer.from(body,'utf8'),
   compressed=deflateRawSync(original),crc=checksum(original);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);
  local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);
  local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(original.length,22);
  local.writeUInt16LE(filename.length,26);
  chunks.push(local,filename,compressed);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);
  entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);
  entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);
  entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);
  entry.writeUInt32LE(original.length,24);entry.writeUInt16LE(filename.length,28);
  entry.writeUInt32LE(offset,42);
  central.push(entry,filename);
  offset+=local.length+filename.length+compressed.length;
 }
 const directory=Buffer.concat(central);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,directory,end]);
}
export function renderXlsx(r:ExportPayload):Buffer{
 const t=exportTable(r),cols=t.headers.length;
 // A formula row is provided on the Datos worksheet for all numeric columns.
 // Formula values are recalculated by Excel/LibreOffice on opening.
 const data=[t.headers,...t.rows],formulas=new Map<string,string>();
 const last=data.length;
 const totals=t.headers.map((_,i)=>{
  const k=column(i),isNumbers=t.rows.length>0&&t.rows.every(row=>row[i]===''||numeric(row[i]));
  if(isNumbers){formulas.set(k+(last+1),'SUM('+k+'2:'+k+last+')');return '';}
  return i===0?'TOTAL (filas exportadas)':'';
 });
 data.push(totals);
 const recap:[string,string][]=[
  ['Origen',r.source],['Sucursal',r.sucursal.nombre],['Sucursal ID',r.sucursal.id],
  ['Moneda',r.currency],['Desde',r.periodo.desde],['Hasta',r.periodo.hasta],
  ['Registros',String(r.meta.total)],['Cobertura','Exportacion completa (maximo 1000)'],
  ['Snapshot','REPEATABLE_READ']
 ];
 const summaryRows=[['Campo','Valor'],...recap,
  ['Totales originales del reporte',JSON.stringify(r.totales??{})],
  ['Formulas', 'Fila TOTAL de hoja Datos; SUM para columnas numericas']];
 const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
  '<Default Extension="xml" ContentType="application/xml"/>'+
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
  '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
 const rel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<sheets><sheet name="Datos" sheetId="1" r:id="rId1"/>'+
  '<sheet name="Resumen" sheetId="2" r:id="rId2"/></sheets>'+
  '<calcPr fullCalcOnLoad="1"/></workbook>';
 const wbrel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'+
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'+
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><name val="Aptos"/></font></fonts>'+
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDAE8F4"/><bgColor indexed="64"/></patternFill></fill></fills>'+
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.000000"/></numFmts>'+
  '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
  '<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0"/>'+ 
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
 return zip([
  {name:'[Content_Types].xml',body:types},{name:'_rels/.rels',body:rel},
  {name:'xl/workbook.xml',body:wb},{name:'xl/_rels/workbook.xml.rels',body:wbrel},
  {name:'xl/styles.xml',body:styles},
  {name:'xl/worksheets/sheet1.xml',body:sheet(data,formulas)},
  {name:'xl/worksheets/sheet2.xml',body:sheet(summaryRows.map(r=>[...r]),new Map())}
 ]);
}
const pdfSafe=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[^\x20-\x7e]/g,'?').replace(/\\/g,'\\\\')
 .replace(/\(/g,'\\(').replace(/\)/g,'\\)');
export function renderPdf(r:ExportPayload):Buffer{
 const t=exportTable(r),panels=Math.ceil(t.headers.length/6),pageRows=24;
 const pages:string[][]=[];
 for(let panel=0;panel<panels;panel++){
  const cols=t.headers.slice(panel*6,panel*6+6);
  for(let start=0;start<Math.max(1,t.rows.length);start+=pageRows){
   const lines=[
    'GASTRO CORE / '+r.source,
    'Sucursal: '+r.sucursal.nombre+' | '+r.periodo.desde+' a '+r.periodo.hasta+
    ' | '+r.currency+' | Registros: '+r.meta.total,
    'Columnas '+(panel*6+1)+'-'+(panel*6+cols.length)+' de '+t.headers.length,
    cols.map(c=>c.slice(0,21)).join(' | '),
    '-'.repeat(122),
    ...t.rows.slice(start,start+pageRows).map(row=>
     row.slice(panel*6,panel*6+6).map(v=>v.replace(/\s+/g,' ').slice(0,21)).join(' | '))
   ];
   pages.push(lines);
  }
 }
 const pageObjects:number[]=[];
 const objects:string[]=[];
 const add=(s:string)=>{objects.push(s);return objects.length;};
 const catalog=add(''),pagesId=add('');
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 for(let i=0;i<pages.length;i++){
  let commands='BT /F1 9 Tf 35 554 Td 12 TL\n';
  for(const l of pages[i])commands+='('+pdfSafe(l)+') Tj T*\n';
  commands+='('+pdfSafe('Pagina '+(i+1)+'/'+pages.length)+') Tj\nET';
  const bytes=Buffer.byteLength(commands,'latin1');
  const stream=add('<< /Length '+bytes+' >>\nstream\n'+commands+'\nendstream');
  pageObjects.push(add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 842 595]'+
   ' /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+stream+' 0 R >>'));
 }
 objects[pagesId-1]='<< /Type /Pages /Kids ['+pageObjects.map(i=>i+' 0 R').join(' ')+
  '] /Count '+pageObjects.length+' >>';
 objects[catalog-1]='<< /Type /Catalog /Pages '+pagesId+' 0 R >>';
 let raw='%PDF-1.4\n%\xD3\xF4\xCC\xE1\n',offs=[0];
 for(let i=0;i<objects.length;i++){
  offs.push(Buffer.byteLength(raw,'latin1'));
  raw+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
 }
 const xref=Buffer.byteLength(raw,'latin1');
 raw+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const n of offs.slice(1))raw+=String(n).padStart(10,'0')+' 00000 n \n';
 raw+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+
  ' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(raw,'latin1');
}
