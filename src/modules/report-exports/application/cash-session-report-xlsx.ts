import ExcelJS from 'exceljs';
import type {CashSessionReportSnapshot} from './ports/cash-session-report.port.js';
import {colors,titleRow,headerRow} from './xlsx-renderer.js';

function moneyFmt(currency:string){return (currency==='GTQ'?'"Q"':'"'+currency+'"')+' #,##0.00';}
function section(ws:ExcelJS.Worksheet,text:string){
 titleRow(ws,text,{size:12,bold:true,color:colors.teal,height:20});
}
function periodLabel(tipo:string){
 return ({DIA:'Día',SEMANA:'Semana',MES:'Mes',ANIO:'Año',PERSONALIZADO:'Personalizado'} as
  Record<string,string>)[tipo]??tipo;
}
function fechaHora(iso:string){return iso?new Date(iso).toLocaleString('es-GT',
 {timeZone:'America/Guatemala'}):'';}

export async function renderCashSessionReportXlsx(r:CashSessionReportSnapshot):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();
 wb.creator='Gastro Core';
 wb.created=new Date(r.generatedAt);
 const fmt=moneyFmt(r.currency);
 const rango=r.periodo.desde===r.periodo.hasta?r.periodo.desde.split('-').reverse().join('/'):
  r.periodo.desde.split('-').reverse().join('/')+' al '+r.periodo.hasta.split('-').reverse().join('/');

 const resumen=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:3,showGridLines:false}]});
 resumen.columns=[{width:30},{width:20},{width:30},{width:20}];
 titleRow(resumen,'GASTRO CORE  /  CIERRES DE CAJA',{size:19,bold:true,color:colors.white,fill:colors.navy,height:30});
 titleRow(resumen,periodLabel(r.periodo.tipo)+': '+rango,{size:13,bold:true,color:colors.navy,height:24});
 titleRow(resumen,r.sucursal.nombre,{size:11,color:colors.muted,height:20});
 section(resumen,'RESUMEN');
 resumen.addRow(['Total de turnos',r.resumen.totalTurnos,'Abiertos',r.resumen.abiertos]);
 resumen.addRow(['Cerrados',r.resumen.cerrados,'Turnos con diferencia',r.resumen.turnosConDiferencia]);
 const r1=resumen.addRow(['Fondo inicial (suma)',Number(r.resumen.fondoInicial)]);r1.getCell(2).numFmt=fmt;
 const r2=resumen.addRow(['Efectivo esperado (suma)',Number(r.resumen.efectivoEsperado)]);r2.getCell(2).numFmt=fmt;
 const r3=resumen.addRow(['Efectivo contado (suma)',Number(r.resumen.efectivoContado)]);r3.getCell(2).numFmt=fmt;
 const r4=resumen.addRow(['Diferencia (suma)',Number(r.resumen.diferencia)]);r4.getCell(2).numFmt=fmt;
 resumen.addRow([]);
 titleRow(resumen,'"Turnos con diferencia" cuenta solo sesiones con arqueo registrado.',
  {size:9,color:colors.muted,height:18});

 const ws=wb.addWorksheet('Turnos',{views:[{state:'frozen',ySplit:4}]});
 const columns=[
  {header:'Caja',width:22},{header:'Cajero',width:22},{header:'Fecha operativa',width:16},
  {header:'Apertura',width:20},{header:'Cierre',width:20},{header:'Estado',width:12},
  {header:'Fondo inicial',width:16},{header:'Efectivo esperado',width:16},
  {header:'Efectivo contado',width:16},{header:'Diferencia',width:14},
  {header:'Origen del arqueo',width:16},{header:'Realizado por',width:20},
  {header:'Ingresos (caja)',width:16},{header:'Egresos (caja)',width:16},
  {header:'Gastos del turno',width:16},{header:'Nota',width:30}
 ];
 ws.columns=columns.map(c=>({width:c.width}));
 titleRow(ws,'TURNOS DE CAJA — '+periodLabel(r.periodo.tipo)+' '+rango,
  {size:16,bold:true,color:colors.navy,height:24});
 titleRow(ws,r.sucursal.nombre,{size:11,color:colors.teal,height:18});
 titleRow(ws,'"Origen del arqueo": ARQUEO_CAJA = arqueo formal registrado; TURNO_CAJA = '+
  'solo el cierre básico del turno; SIN_DATOS = turno abierto o sin cerrar todavía.',
  {size:9,color:colors.muted,height:18});
 headerRow(ws,columns.map(c=>c.header));
 const moneyCols=[7,8,9,10,13,14,15];
 r.turnos.forEach((t,i)=>{
  const row=ws.addRow([t.caja,t.cajero,t.fechaOperativa.split('-').reverse().join('/'),
   fechaHora(t.abiertaEn),fechaHora(t.cerradaEn),t.estado,
   Number(t.fondoInicial),Number(t.efectivoEsperado),Number(t.efectivoContado),Number(t.diferencia),
   t.fuenteArqueo,t.realizadoPor,Number(t.ingresos),Number(t.egresos),Number(t.gastosDelTurno),t.notaArqueo]);
  row.eachCell((cell,col)=>{
   if(moneyCols.includes(col)){cell.numFmt=fmt;cell.alignment={horizontal:'right'};}
   if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};
  });
 });
 if(!r.turnos.length){
  const row=ws.addRow(['(sin turnos de caja en el período)']);
  ws.mergeCells(row.number,1,row.number,columns.length);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }else{
  ws.autoFilter={from:{row:4,column:1},to:{row:4+r.turnos.length,column:columns.length}};
 }

 const metodos=wb.addWorksheet('Por método de pago',{views:[{state:'frozen',ySplit:2}]});
 metodos.columns=[{width:22},{width:22},{width:16},{width:16},{width:12}];
 titleRow(metodos,'COBROS POR MÉTODO DE PAGO, POR TURNO',{size:14,bold:true,color:colors.navy,height:22});
 headerRow(metodos,['Caja','Cajero','Fecha operativa','Método','Monto']);
 let rowIdx=0;
 r.turnos.forEach(t=>{
  t.porMetodoPago.forEach(m=>{
   const row=metodos.addRow([t.caja,t.cajero,t.fechaOperativa.split('-').reverse().join('/'),
    m.metodo,Number(m.monto)]);
   row.getCell(5).numFmt=fmt;row.getCell(5).alignment={horizontal:'right'};
   if(rowIdx%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.gray}};});
   rowIdx++;
  });
 });
 if(!rowIdx){
  const row=metodos.addRow(['(sin cobros registrados en el período)']);
  metodos.mergeCells(row.number,1,row.number,5);
  row.getCell(1).font={italic:true,color:{argb:colors.muted}};
 }

 const buf=await wb.xlsx.writeBuffer();
 return Buffer.from(buf);
}
